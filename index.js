const express = require("express");
const app = express();
const cors = require("cors");

require("dotenv").config();

const { initializeDatabase } = require("./db/db.connect.js");

const Product = require("./models/product.models");
const User = require("./models/user.models.js");

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());

initializeDatabase();

// =========================================================================
// 1. AUTHENTICATION MIDDLEWARE
// =========================================================================
async function protect(req, res, next) {
  try {
    // Intercept header named 'x-user-id'
    const userId = req.headers["x-user-id"];

    if (!userId) {
      return res
        .status(401)
        .json({ error: "Not authorized. Missing 'x-user-id' header." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ error: "User not found with provided ID." });
    }

    // Bind authenticated user data context directly onto request object
    req.user = user;
    next();
  } catch (error) {
    res
      .status(401)
      .json({ error: "Authentication failed", details: error.message });
  }
}

// =========================================================================
// HELPER FUNCTIONS (FOR ADDRESS, WISHLIST & CART)
// =========================================================================

async function addAddressData(userId, addressObj) {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $push: { addresses: addressObj } },
      { new: true, runValidators: true },
    ).select("-password");
    return updatedUser;
  } catch (error) {
    throw error;
  }
}

async function addToWishlistData(userId, productId) {
  try {
    // $addToSet acts natively to drop modifications if an item ID already exists
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $addToSet: { wishlist: productId } },
      { new: true },
    ).select("-password");
    return updatedUser;
  } catch (error) {
    throw error;
  }
}

async function addToCartData(userId, productId, quantity) {
  try {
    const qty = Number(quantity) || 1;
    // Inspect whether item array block exists matching current criteria
    const userHasProduct = await User.findOne({
      _id: userId,
      "cart.product": productId,
    });

    if (userHasProduct) {
      return await User.findOneAndUpdate(
        { _id: userId, "cart.product": productId },
        { $inc: { "cart.$.quantity": qty } },
        { new: true },
      ).select("-password");
    } else {
      return await User.findByIdAndUpdate(
        userId,
        { $push: { cart: { product: productId, quantity: qty } } },
        { new: true },
      ).select("-password");
    }
  } catch (error) {
    throw error;
  }
}

// =========================================================================
// ROUTE HANDLERS (PROTECTED BY MIDDLEWARE)
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

const Port = process.env.PORT || 5500;
app.listen(Port, () => {
  console.log("Server is listening at:", Port);
});
