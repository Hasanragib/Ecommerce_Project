const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

// Sub-schema for Indian Address Management
const AddressSchema = new mongoose.Schema({
  title: { type: String, default: "Home" }, // e.g., "Home", "Office"
  street: { type: String, required: true }, // Flat, House no., Building, Company, Apartment
  area: { type: String, required: true }, // Locality, Colony, Street name
  city: { type: String, required: true },
  state: { type: String, required: true },

  // 🇮🇳 Modified to Pincode with strict 6-digit validation
  pincode: {
    type: String,
    required: [true, "Pincode is required"],
    trim: true,
    validate: {
      validator: function (v) {
        return /^\d{6}$/.test(v); // Regex: Checks if it is exactly 6 digits
      },
      message: (props) => `${props.value} is not a valid 6-digit Pincode!`,
    },
  },
});

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },

    addresses: [AddressSchema], // Array of saved shipping addresses

    wishlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],

    cart: [
      {
        product: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
        quantity: { type: Number, default: 1, min: 1 },
      },
    ],
  },
  { timestamps: true },
);

// 2. PRE-SAVE HOOK: Automatically hash the password before saving
UserSchema.pre("save", async function () {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified("password")) return;
  
  try {
    // Generate a salt with a cost factor of 10
    const salt = await bcrypt.genSalt(10);
    // Hash the password using the generated salt
    this.password = await bcrypt.hash(this.password, salt);
  } catch (err) {
    throw err;
  }
});

// 3. CUSTOM METHOD: To compare entered password with the hashed password during login
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", UserSchema);
