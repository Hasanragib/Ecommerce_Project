const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");

require("dotenv").config();

const { initializeDatabase } = require("./db/db.connect.js");

const Product = require("./models/product.models.js");
const User = require("./models/user.models.js");

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

initializeDatabase();

// Friendly landing route for Vercel root URL
app.get("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to the E-Commerce Backend API!",
    status: "Healthy & Active",
  });
});

// =========================================================================
// 1. SECURE JWT AUTHENTICATION MIDDLEWARE
// =========================================================================
async function protect(req, res, next) {
  try {
    // Expects header standard: "Authorization: Bearer <JWT_TOKEN>"
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ error: "Access denied. No login token provided." });
    }

    // Decode and verify token string using secret signature key
    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);

    // Fetch user context by the ID stored inside the payload token block
    const user = await User.findById(decodedPayload.id);
    if (!user) {
      return res.status(404).json({ error: "User profile context not found." });
    }

    req.user = user;
    next();
  } catch (error) {
    res
      .status(403)
      .json({ error: "Invalid or expired token. Please sign in again." });
  }
}

// =========================================================================
// HELPER FUNCTIONS (UPDATED FIX FOR DEPRECATION WARNINGS)
// =========================================================================

async function addAddressData(userId, addressObj) {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { addresses: addressObj } },
      { returnDocument: "after", runValidators: true }, // Fixed deprecation option
    ).select("-password");
    return updatedUser;
  } catch (error) {
    throw error;
  }
}

async function addToWishlistData(userId, productId) {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { wishlist: productId } },
      { returnDocument: "after" }, // Fixed deprecation option
    ).select("-password");
    return updatedUser;
  } catch (error) {
    throw error;
  }
}

async function addToCartData(userId, productId, quantity) {
  try {
    const qty = Number(quantity) || 1;
    const userHasProduct = await User.findOne({
      _id: userId,
      "cart.product": productId,
    });

    if (userHasProduct) {
      return await User.findOneAndUpdate(
        { _id: userId, "cart.product": productId },
        { $inc: { "cart.$.quantity": qty } },
        { returnDocument: "after" }, // Fixed deprecation option
      ).select("-password");
    } else {
      return await User.findByIdAndUpdate(
        userId,
        { $push: { cart: { product: productId, quantity: qty } } },
        { returnDocument: "after" }, // Fixed deprecation option
      ).select("-password");
    }
  } catch (error) {
    throw error;
  }
}

// =========================================================================
// AUTHENTICATION ROUTE HANDLERS
// =========================================================================

// @route   POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ error: "Invalid email or password credentials." });
    }

    // 2. Use the CUSTOM METHOD from your model to check the hashed password
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res
        .status(401)
        .json({ error: "Invalid email or password credentials." });
    }

    // 3. If it matches, generate the token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET || "SECRET_KEY",
      {
        expiresIn: "7d",
      },
    );

    res.status(200).json({
      success: true,
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ error: "Server error during login." });
  }
});

// =========================================================================
// PROTECTED USER ACTION ROUTE HANDLERS
// =========================================================================

app.post("/api/users/address", protect, async (req, res) => {
  try {
    const { title, street, area, city, state, pincode } = req.body;
    if (!title || !street || !city || !state || !pincode) {
      return res
        .status(400)
        .json({ error: "Missing required address fields." });
    }

    const updatedUser = await addAddressData(req.user.id, {
      title,
      street,
      area,
      city,
      state,
      pincode,
    });
    res.status(200).json({ success: true, data: updatedUser.addresses });
  } catch (error) {
    res.status(500).json({ error: "Failed to add address details." });
  }
});

app.post("/api/users/wishlist", protect, async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    const updatedUser = await addToWishlistData(req.user.id, productId);
    res.status(200).json({ success: true, data: updatedUser.wishlist });
  } catch (error) {
    res.status(500).json({ error: "Failed to update wishlist details." });
  }
});

app.post("/api/users/cart", protect, async (req, res) => {
  try {
    const { productId, quantity } = req.body;
    if (!productId) {
      return res.status(400).json({ error: "Product ID is required." });
    }

    const updatedUser = await addToCartData(req.user.id, productId, quantity);
    res.status(200).json({ success: true, data: updatedUser.cart });
  } catch (error) {
    res.status(500).json({ error: "Failed to update cart item details." });
  }
});

// Secure variant profile retrieval tracking context bound from JWT token payload
// @route   GET /api/users/userProfile/me
app.get("/api/users/userProfile/me", protect, async (req, res) => {
  try {
    const getUserProfile = await getUserProfileData(req.user.id);
    if (getUserProfile) {
      res.status(200).json({
        success: true,
        data: {
          addresses: getUserProfile.addresses,
          wishlist: getUserProfile.wishlist,
          cart: getUserProfile.cart,
        },
      });
    } else {
      res
        .status(404)
        .json({ error: "User profile profile data context missing." });
    }
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to fetch session metadata information." });
  }
});

// =========================================================================
// READ-ONLY UNPROTECTED ROUTE CORES
// =========================================================================

async function createUsers(newUser) {
  try {
    const user = new User(newUser);
    return await user.save();
  } catch (error) {
    throw error;
  }
}

app.post("/users", async (req, res) => {
  try {
    const saveUsers = await createUsers(req.body);
    res.status(201).json({ message: "User added successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to add User." });
  }
});

async function viewAllProducts() {
  try {
    const viewProducts = await Product.find();
    return viewProducts;
  } catch (error) {
    throw error;
  }
}

app.get("/api/products", async (req, res) => {
  try {
    const allProducts = await viewAllProducts();
    if (allProducts != 0) {
      res.json(allProducts);
    } else {
      res.status(404).json({ error: "Products are not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch products." });
  }
});

async function viewProduct(productId) {
  try {
    const viewProduct = await Product.findById(productId);
    return viewProduct;
  } catch (error) {
    throw error;
  }
}

app.get("/api/products/:productId", async (req, res) => {
  try {
    const getProduct = await viewProduct(req.params.productId);
    if (getProduct != 0) {
      res.json(getProduct);
    } else {
      res.status(404).json({ error: "Product not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Product." });
  }
});

async function viewUser(userId) {
  try {
    const viewUsers = await User.findById(userId);
    return viewUsers;
  } catch (error) {
    throw error;
  }
}

app.get("/api/users/:userId", async (req, res) => {
  try {
    const getUser = await viewUser(req.params.userId);
    if (getUser != 0) {
      res.json(getUser);
    } else {
      res.status(404).json({ error: "User not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user." });
  }
});

async function getUserProfileData(userId) {
  try {
    const userProfile = await User.findById(userId)
      .populate("wishlist")
      .populate("cart.product")
      .select("-password");
    return userProfile;
  } catch (error) {
    throw error;
  }
}

app.get("/api/users/userProfile/:userId", async (req, res) => {
  try {
    const getUserProfile = await getUserProfileData(req.params.userId);
    if (getUserProfile != 0) {
      res.status(200).json({
        success: true,
        data: {
          addresses: getUserProfile.addresses,
          wishlist: getUserProfile.wishlist,
          cart: getUserProfile.cart,
        },
      });
    } else {
      res.status(404).json({ error: "User profile not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "failed to fetch user profile data." });
  }
});

async function viewProductByCategory() {
  try {
    const viewProdByCategory = await Product.distinct("category");
    return viewProdByCategory;
  } catch (error) {
    throw error;
  }
}

app.get("/api/categories", async (req, res) => {
  try {
    const getProductByCategory = await viewProductByCategory();
    if (getProductByCategory && getProductByCategory.length > 0) {
      res.json({
        data: {
          categories: getProductByCategory,
        },
      });
    } else {
      res.status(404).json({ error: "data not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Category wise data." });
  }
});

async function viewProductByCategoryId(categoryId) {
  try {
    const viewProdByCategory = await Product.find({ category: categoryId });
    return viewProdByCategory;
  } catch (error) {
    throw error;
  }
}

app.get("/api/categories/:categoryId", async (req, res) => {
  try {
    const getProductByCategory = await viewProductByCategoryId(
      req.params.categoryId,
    );
    if (getProductByCategory && getProductByCategory.length > 0) {
      res.json(getProductByCategory);
    } else {
      res.status(404).json({ error: "data not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch Category wise data." });
  }
});

// =========================================================================
// ENVIRONMENT OR VERCEL BOOT FORWARDING CONFIG
// =========================================================================
const Port = process.env.PORT;
app.listen(Port, () => {
  console.log("Server is listening at:", Port);
});
