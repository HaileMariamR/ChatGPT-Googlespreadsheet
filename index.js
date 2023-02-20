import { Configuration, OpenAIApi } from "openai";
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleSpreadsheet } from "google-spreadsheet";
import dotenv from "dotenv";
import mongoose from "mongoose";

//currentuser
let currentUser = "Harry";

// Mongodb Configuration
mongoose.connect("mongodb://localhost:27017", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
mongoose.set("strictQuery", true);

//create schema for chat
const chatSchema = new mongoose.Schema(
  {
    usename: String,
    messags: [{ userType: String, text: String }],
  },
  { collation: "Chats" }
);
const Chat = mongoose.model("Chat", chatSchema);


//create function to add message to database
const addMessage = (user, messages) => {
  const newChat = new Chat({ name: user, messags: messages });
  newChat.save(function (err) {
    if (err) {
      console.log(err);
    } else {
      console.log("New chat created successfully");
    }
  });
};

// Open AI Configuration
const configuration = new Configuration({
  apiKey: "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",
});

const openai = new OpenAIApi(configuration);

// Express Configuration
const app = express();
const port = 3080;

app.use(bodyParser.json());
app.use(cors());
dotenv.config();
// app.use(require("morgan")("dev"));


//Google SpreadSheet Configuration

const PurchaseSpreadsheet = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

await PurchaseSpreadsheet.useServiceAccountAuth({
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: process.env.GOOGLE_PRIVATE_KEY,
});

await PurchaseSpreadsheet.loadInfo();

const sheetOne = PurchaseSpreadsheet.sheetsByIndex[0];
const data = await sheetOne.getRows();


// define required function for spreadsheet control

const getAllkeys = (allRows) => {
  return allRows
    .filter((r) => r._rawData[2] == "avaliable")
    .map((row) => row._rawData[1]);
};

const updateKeyAvailability = async (allRows, columnKey) => {
  const updateRow = allRows.find((row) => row.Key == columnKey);
  updateRow.startdate = new Date(
    new Date().toLocaleString("en-US", { timeZone: "UTC" })
  );
  updateRow.avaliablity = "busy";
  updateRow.enddate = "";
  console.log(updateRow);
  await updateRow.save();

  return updateRow.startdate;
};

const endKeyUsage = async (allRows, columnKey) => {
  const endUpdate = allRows.find((row) => row.Key == columnKey);
  endUpdate.enddate = new Date(
    new Date().toLocaleString("en-US", { timeZone: "UTC" })
  );
  await endUpdate.save();
};


// posible prompts user

// -> 1. get all keys
// -> 2. confirm key
// -> 3. finished

// posible prompts chat

// -> 1. generate all keys
// -> 2. update item record (timestamps)
// -> 3. update item record and send payment info.



// Primary Open AI Route
app.post("/", async (req, res) => {

  const { message, key } = req.body;

  let finalPrompt = "";

  if (message == "get all keys" && key == "") {

    let allavaliablekeys = getAllkeys(data);

    finalPrompt = `generate this ${allavaliablekeys} list as option and titled it as avaliable keys`;

    addMessage(currentUser, [
      {
        userType: "user",
        message: message,
      },
      {
        userType: "bot",
        message: finalPrompt,
      },
    ]);
  } else if (key != "" && message != "finished") {

    const startingDate = await updateKeyAvailability(data, key);

    finalPrompt = `tell them that they are using ${key} starting from this date ${startingDate} `;

    addMessage(currentUser, [
      {
        userType: "user",
        message: message,
      },
      {
        userType: "bot",
        message: finalPrompt,
      },
    ]);
  } else if (message == "finished" && key != "") {

    await endKeyUsage(data, key);

    finalPrompt =
      "say thanks for using keys and responed them with dummy payment information";

    addMessage(currentUser, [
      {
        userType: "user",
        message: message,
      },
      {
        userType: "bot",
        message: finalPrompt,
      },
    ]);
  }

  const response = await openai.createCompletion({
    model: "text-davinci-003", // "text-davinci-003",
    prompt: `${finalPrompt}`,
    max_tokens: 100,
    temperature: 0.1,
  });

  res.json({
    message: response.data.choices[0].text,
  });
  
});

// Get Models Route
app.get("/models", async (req, res) => {
  const response = await openai.listEngines();
  res.json({
    models: response.data,
  });
});

// Start the server
app.listen(port, () => {
  console.log(
    `Example app listening at http://localhost:${port} ${PurchaseSpreadsheet.title}`
  );
});
