const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    category: {
      type: String,
      required: true,
      trim: true,
      enum: {
        values: ["Audio", "Laptops", "Smartphones", "Accessories", "Monitors"],
        message: "{VALUE} is not a valid category!", // Custom error message if validation fails
      },
    },
    brand: { type: String, required: true },
    image: {
      type: String,
      default: "https://placehold.co/600x400?text=Product\nImage",
    },
    rating: {
      type: Number,
      default: 0,
      min: [0, "Rating cannot be less than 0.0"],
      max: [5, "Rating cannot be greater than 5.0"],
    },
    inventory: { type: Number, default: 1 },
  },
  { timestamps: true },
);

// Export the model so other files can use it
module.exports = mongoose.model("Product", ProductSchema);
