require('dotenv').config();
const express = require('express');
const Openai = require('openai');
const cors = require('cors');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');

const { initializeApp } = require('firebase/app');
const {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
} = require('firebase/firestore');
const firebaseConfig = {
  apiKey: 'AIzaSyBQtVK865PFTA0xyAkR8PSAs8CeVo3IIdI',
  authDomain: 'cool-u.firebaseapp.com',
  projectId: 'cool-u',
  storageBucket: 'cool-u.appspot.com',
  messagingSenderId: '1030667178596',
  appId: '1:1030667178596:web:d08e0396558ddf64f38571',
  measurementId: 'G-007VB31F2G',
};
// Initialize Firebase
const application = initializeApp(firebaseConfig);
// Initialize Firestore
const db = getFirestore(application);

const app = express();
const openai = new Openai({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors());
app.use(bodyParser.json());

const SystemPrompt = `You are an expert chatbot designed to provide accurate and insightful information about greenhouse gases (GHGs), their sources, and their impacts on both human health and the environment. Users can ask questions related to:

The definition and types of greenhouse gases.
Sources of greenhouse gas emissions (e.g., transportation, industry, agriculture).
The effects of greenhouse gases on climate change and global warming.
The health impacts of greenhouse gases, including air quality and respiratory diseases.
Mitigation strategies and solutions to reduce greenhouse gas emissions.
The relationship between greenhouse gases and extreme weather events.
Your goal is to deliver clear, evidence-based responses that educate users on these topics, while also providing practical advice on how individuals and communities can contribute to reducing greenhouse gas emissions for a healthier planet.
`;

const CountryPrompt = `
Provide the latitude and longitude of [state of the United State name] in the format and just return
[latitude, longitude].
`;
app.post('/chatbot', async (req, res) => {
  const message = req.body.message;
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: SystemPrompt },
      {
        role: 'user',
        content: message,
      },
    ],
  });
  res.json({
    response: completion.choices[0].message.content,
  });
});

app.get('/load', async (req, res) => {
  // Launch Puppeteer browser
  const browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
  });

  // Open a new page
  const page = await browser.newPage();
  const url =
    'https://solarpower.guide/solar-energy-insights/states-ranked-carbon-dioxide-emissions';
  // Navigate to the provided URL
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
  });
  // WebScrape data
  const data = await page.evaluate(() => {
    const table = document.querySelector('table');
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    const data = rows.map((row) => {
      const rank = row.querySelector('td:nth-child(1)').innerText;
      const state = row.querySelector('td:nth-child(2)').innerText;
      const annualCO2Emissions = row.querySelector('td:nth-child(3)').innerText;
      return { rank, state, annualCO2Emissions };
    });
    return data;
  });

  // Close the browser
  await browser.close();

  data.forEach(async (row) => {
    try {
      // Reference to the country document inside the globalEmissions collection
      const countryRef = doc(collection(db, 'globalEmissions'), row.state);

      // Set the data for this country document
      await setDoc(countryRef, {
        rank: row.rank,
        annualCO2Emissions: row.annualCO2Emissions,
      });
    } catch (error) {
      console.error(`Error adding country ${row.state}:`, error);
    }
  });
  res.send('Welcome to the Greenhouse Gas Expert Chatbot API!');
});

app.post('/getCountryEmissions', async (req, res) => {
  const state = req.body.state;
  const stateRef = doc(collection(db, 'globalEmissions'), state);
  const docSnapshot = await getDoc(stateRef);
  if (!docSnapshot.exists()) {
    res.send({
      error: `Country ${state} not found.`,
    });
    return;
  }
  const data = docSnapshot.data();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: CountryPrompt },
      {
        role: 'user',
        content: state,
      },
    ],
  });

  res.json({
    rank: data.rank,
    annualCO2Emissions: data.annualCO2Emissions,
    position: JSON.parse(completion.choices[0].message.content),
  });
});
const port = 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
