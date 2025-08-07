const Restaurant = require("../models/restaurant");
const Category = require("../models/category");
const Coupon = require("../models/coupon");
const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const moment = require("moment-timezone");
const RESTAURANT_TIMEZONE = process.env.RESTAURANT_TIMEZONE || "Europe/Paris";

// Helper function to add Z to date strings if missing
const addTimezoneZ = (dateString) => {
  if (!dateString) return null;
  
  // If date doesn't have timezone info, add Z at the end
  if (!dateString.includes('Z') && !dateString.includes('+') && !dateString.match(/-\d{2}:\d{2}$/)) {
    return dateString + 'Z';
  }
  
  return dateString;
};

exports.addCoupon = async (req, res) => {
  try {
    const { restaurantId } = req;
    const {
      code,
      couponType,
      couponValue,
      minOrderAmount,
      startDate,
      endDate,
      categoryType,
      couponCategories,
    } = req.body;

    if (!code || !couponType || !couponValue) {
      return res.status(400).json({
        message: "Code, type de remise et valeur de remise sont requis",
      });
    }

    // Validate categoryType
    if (!["all", "categories"].includes(categoryType)) {
      return res.status(400).json({
        message: "Type de catégorie invalide. Doit être 'all' ou 'categories'",
      });
    }

    // Validate that categories are provided when needed
    if (
      categoryType === "categories" &&
      (!couponCategories || couponCategories.length === 0)
    ) {
      return res.status(400).json({
        message: "Veuillez sélectionner au moins une catégorie",
      });
    }

    // Validate date interval
    const now = moment().tz(RESTAURANT_TIMEZONE);
    const start = startDate ? moment(addTimezoneZ(startDate)).tz(RESTAURANT_TIMEZONE) : now;
    const end = endDate ? moment(addTimezoneZ(endDate)).tz(RESTAURANT_TIMEZONE) : null;

    if (end && start.isSameOrAfter(end)) {
      return res.status(400).json({
        message: "La date et l'heure de fin doivent être postérieures à la date et l'heure de début",
      });
    }
    // Check if coupon code already exists for this restaurant
    const existingCoupon = await Coupon.findOne({
      restaurantId,
      code: code.toUpperCase(),
    });

    if (existingCoupon) {
      return res.status(400).json({ message: "Ce code promo existe déjà" });
    }

    const newCoupon = new Coupon({
      code: code.toUpperCase(),
      couponType,
      couponValue: Number(couponValue),
      minOrderAmount: Number(minOrderAmount) || 0,
      isActive: true,
      startDate: start,
      endDate: end,
      categoryType: categoryType || "all",
      couponCategories: categoryType === "categories" ? couponCategories : [],
      restaurantId,
    });

    await newCoupon.save();

    return res.status(201).json({
      message: "Code promo ajouté avec succès",
      coupon: newCoupon,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCoupons = async (req, res) => {
  try {
    const { restaurantId } = req;

    const coupons = await Coupon.find({ restaurantId })
      .populate("couponCategories", "name")
      .sort({ createdAt: -1 });

    return res.status(200).json(
      coupons,
    );
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCoupon = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { couponId } = req.params;

    const coupon = await Coupon.findOne({
      _id: couponId,
      restaurantId,
    }).populate("couponCategories", "name");

    if (!coupon) {
      return res.status(404).json({ message: "Code promo non trouvé" });
    }

    return res.status(200).json(
      coupon,
    );
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.updateCoupon = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { couponId } = req.params;
    const {
      code,
      couponType,
      couponValue,
      minOrderAmount,
      isActive,
      startDate,
      endDate,
      categoryType,
      couponCategories,
    } = req.body;

    const coupon = await Coupon.findOne({
      _id: couponId,
      restaurantId,
    });

    if (!coupon) {
      return res.status(404).json({ message: "Code promo non trouvé" });
    }

    // Check if new code already exists (excluding current coupon)
    if (code && code.toUpperCase() !== coupon.code) {
      const existingCoupon = await Coupon.findOne({
        restaurantId,
        code: code.toUpperCase(),
        _id: { $ne: couponId },
      });

      if (existingCoupon) {
        return res.status(400).json({ message: "Ce code promo existe déjà" });
      }
    }

    // Validate categoryType if provided
    if (categoryType && !["all", "categories"].includes(categoryType)) {
      return res.status(400).json({
        message: "Type de catégorie invalide. Doit être 'all' ou 'categories'",
      });
    }

    // Validate categories if categoryType is categories
    if (
      categoryType === "categories" &&
      (!couponCategories || couponCategories.length === 0)
    ) {
      return res.status(400).json({
        message: "Veuillez sélectionner au moins une catégorie",
      });
    }

     const newStartDate = startDate ? 
      moment(addTimezoneZ(startDate)).tz(RESTAURANT_TIMEZONE) : 
      moment(coupon.startDate).tz(RESTAURANT_TIMEZONE);

    const newEndDate = endDate !== undefined ? 
      (endDate ? moment(addTimezoneZ(endDate)).tz(RESTAURANT_TIMEZONE) : null) : 
      (coupon.endDate ? moment(coupon.endDate).tz(RESTAURANT_TIMEZONE) : null);

    if (newEndDate && newStartDate.isSameOrAfter(newEndDate)) {
      return res.status(400).json({
        message: "La date et l'heure de fin doivent être postérieures à la date et l'heure de début",
      });
    }

    // Update fields
    if (code) coupon.code = code.toUpperCase();
    if (couponType) coupon.couponType = couponType;
    if (couponValue !== undefined) coupon.couponValue = Number(couponValue);
    if (minOrderAmount !== undefined)
      coupon.minOrderAmount = Number(minOrderAmount);
    if (isActive !== undefined) coupon.isActive = isActive;
    if (startDate !== undefined) coupon.startDate = newStartDate;
    if (endDate !== undefined) coupon.endDate = newEndDate;
    if (categoryType) {
      coupon.categoryType = categoryType;
      coupon.couponCategories =
        categoryType === "categories" ? couponCategories || [] : [];
    }

    await coupon.save();

    return res.status(200).json({
      message: "Code promo mis à jour avec succès",
      coupon,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { couponId } = req.params;

    const coupon = await Coupon.findOneAndDelete({
      _id: couponId,
      restaurantId,
    });

    if (!coupon) {
      return res.status(404).json({ message: "Code promo non trouvé" });
    }

    return res.status(200).json({
      message: "Code promo supprimé avec succès",
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.toggleCoupon = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { couponId } = req.params;

    const coupon = await Coupon.findOne({
      _id: couponId,
      restaurantId,
    });

    if (!coupon) {
      return res.status(404).json({ message: "Code promo non trouvé" });
    }

    coupon.isActive = !coupon.isActive;
    await coupon.save();

    return res.status(200).json({
      message: `Code promo ${coupon.isActive ? "activé" : "désactivé"}`,
      coupon,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const { restaurantId } = req;
    const { code, orderTotal, orderItems } = req.body;

    if (!code || !orderTotal || !orderItems) {
      return res.status(400).json({ 
        message: "Code promo, total de commande et articles requis" 
      });
    }

    const coupon = await Coupon.findOne({
      restaurantId,
      code: code.toUpperCase(),
      isActive: true
    }).populate('couponCategories', '_id name');

    if (!coupon) {
      return res.status(404).json({ message: "Code promo invalide ou inactif" });
    }

    const now = moment().tz(RESTAURANT_TIMEZONE);
    
    // Check if coupon has started
    if (coupon.startDate) {
      const startMoment = moment(coupon.startDate).tz(RESTAURANT_TIMEZONE);
      if (now.isBefore(startMoment)) {
        return res.status(400).json({ 
          message: `Ce code promo sera valide à partir du ${startMoment.format('DD/MM/YYYY à HH:mm')}` 
        });
      }
    }

    // Check if coupon has expired
    if (coupon.endDate) {
      const endMoment = moment(coupon.endDate).tz(RESTAURANT_TIMEZONE);
      if (now.isAfter(endMoment)) {
        return res.status(400).json({ 
          message: `Ce code promo a expiré le ${endMoment.format('DD/MM/YYYY à HH:mm')}` 
        });
      }
    }

    // Check usage limit
    if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
      return res.status(400).json({ 
        message: "Ce code promo a atteint sa limite d'utilisation" 
      });
    }

    // Check minimum order amount
    if (orderTotal < coupon.minOrderAmount) {
      return res.status(400).json({ 
        message: `Commande minimum de ${coupon.minOrderAmount}€ requise pour ce code promo` 
      });
    }

    // Calculate applicable items and discount
    let applicableItems = [];
    let applicableTotal = 0;

    if (coupon.categoryType === "all") {
      applicableItems = orderItems;
      applicableTotal = orderTotal;
    } else if (coupon.categoryType === "categories") {
      // Only proceed if there are categories (safety check)
      if (coupon.couponCategories && coupon.couponCategories.length > 0) {
        const categoryIds = coupon.couponCategories.map(cat => cat._id.toString());
        applicableItems = orderItems.filter(item => 
          categoryIds.includes(item.product?.category?.toString())
        );
        
        // Calculate total of applicable items
        applicableTotal = applicableItems.reduce((total, item) => {
          return total + (item.price * item.quantity);
        }, 0);
      }
    }

    if (applicableTotal === 0) {
      return res.status(400).json({ 
        message: coupon.categoryType === "categories" 
          ? "Aucun article de la catégorie applicable trouvé pour ce code promo"
          : "Aucun article applicable trouvé pour ce code promo" 
      });
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.couponType === 'percentage') {
      discountAmount = (applicableTotal * coupon.couponValue) / 100;
    } else {
      discountAmount = Math.min(coupon.couponValue, applicableTotal);
    }

    const finalTotal = Math.max(0, orderTotal - discountAmount);

    return res.status(200).json({
      valid: true,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        couponType: coupon.couponType,
        couponValue: coupon.couponValue,
        categoryType: coupon.categoryType,
        couponCategories: coupon.categoryType === "categories" ? coupon.couponCategories : [],
        startDate: coupon.startDate,
        endDate: coupon.endDate,
        maxUsage: coupon.maxUsage,
        usageCount: coupon.usageCount,
      },
      originalTotal: orderTotal,
      applicableTotal: Math.round(applicableTotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      finalTotal: Math.round(finalTotal * 100) / 100,
      applicableItems: applicableItems.map(item => ({
        id: item.product._id,
        name: item.product.name,
        quantity: item.quantity,
        price: item.price
      }))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCouponStatus = async (req, res) => {
  try {
    const { restaurantId } = req;

    const now = new Date();

    const coupons = await Coupon.find({ restaurantId })
      .populate('couponCategories', 'name')
      .sort({ createdAt: -1 });

    const couponsWithStatus = coupons.map(coupon => {
      let status = 'active';
      
        if (!coupon.isActive) {
        status = 'inactive';
      } else if (coupon.startDate && now.isBefore(moment(coupon.startDate).tz(RESTAURANT_TIMEZONE))) {
        status = 'upcoming';
      } else if (coupon.endDate && now.isAfter(moment(coupon.endDate).tz(RESTAURANT_TIMEZONE))) {
        status = 'expired';
      } else if (coupon.maxUsage && coupon.usageCount >= coupon.maxUsage) {
        status = 'used_up';
      }

      return {
        ...coupon.toObject(),
        status,
        // Ensure categories is empty array for "all" type
        startDateFormatted: coupon.startDate ? 
          moment(coupon.startDate).tz(RESTAURANT_TIMEZONE).format('DD/MM/YYYY HH:mm') : null,
        endDateFormatted: coupon.endDate ? 
          moment(coupon.endDate).tz(RESTAURANT_TIMEZONE).format('DD/MM/YYYY HH:mm') : null,
        // Ensure categories is empty array for "all" type
        couponCategories: coupon.categoryType === "all" ? [] : coupon.couponCategories
      };
    });

    return res.status(200).json({
      coupons: couponsWithStatus,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

exports.getCategoriesForCoupons = async (req, res) => {
  try {
    const { restaurantId } = req;

    const categories = await Category.find({ restaurantId })
      .select("_id name")
      .sort({ name: 1 });

    return res.status(200).json({
      categories,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
