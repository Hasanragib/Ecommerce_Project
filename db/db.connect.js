require("dotenv").config();
const mongoose = require("mongoose");

const mongoUri = process.env.MONGODB;

const initializeDatabase = async () => {
  try {
    // Force execution to pause until the connection is fully open
    await mongoose.connect(mongoUri);
    console.log("Database connected successfully.");
  } catch (error) {
    console.error("Error connecting to database:", error);
    throw error;
  }
};

module.exports = { initializeDatabase };
