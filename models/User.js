const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    searchHistory: [String],
    isAdmin: { type: Boolean, default: false }, // New field for admin status
    createdAt: { type: Date, default: Date.now }, // New field for creation date
    updatedAt: { type: Date, default: Date.now }, // New field for update date
    deletedAt: { type: Date, default: null }, // New field for deletion date
});

const User = mongoose.model("User", userSchema);

module.exports = User;