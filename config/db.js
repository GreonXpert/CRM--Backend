// /server/config/db.js

const mongoose = require('mongoose');

/**
 * Establishes a connection to the MongoDB database.
 * It uses the connection string from the environment variables.
 * The function will log a success message upon connection
 * or an error message if the connection fails.
 */
const connectDB = async () => {
  try {
    // Attempt to connect to the MongoDB cluster
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options are to prevent deprecation warnings
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Log a success message with the host name if connection is successful
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Log the error message if the connection fails
    console.error(`Error: ${error.message}`);
    
    // Exit the process with failure code
    process.exit(1);
  }
};

// Export the connectDB function to be used in other parts of the application
module.exports = connectDB;
