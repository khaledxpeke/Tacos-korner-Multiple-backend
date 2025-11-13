const Currency = require("../models/currency");

exports.getCurrencies = async (req, res) => {
  try {
    const currencies = await Currency.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.json(currencies);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to fetch currencies", error: error.message });
  }
};

exports.createCurrency = async (req, res) => {
  try {
    const { code, name, symbol } = req.body;

    const existing = await Currency.findOne({ code: code.toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Currency code already exists" });
    }

    const currency = new Currency({
      code: code.toUpperCase(),
      name,
      symbol,
    });

    await currency.save();
    res.status(201).json(currency);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to create currency", error: error.message });
  }
};

exports.updateCurrency = async (req, res) => {
  try {
    const { currencyId } = req.params;
    const { code, name, symbol, isActive } = req.body;

    const currency = await Currency.findOneAndUpdate(
      { _id: currencyId },
      { code: code.toUpperCase(), name, symbol, isActive },
      { new: true }
    );

    if (!currency) {
      return res.status(404).json({ message: "Currency not found" });
    }

    res.status(200).json(currency);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to update currency", error: error.message });
  }
};

exports.deleteCurrency = async (req, res) => {
  try {
    const { currencyId } = req.params;
    await Currency.findOneAndDelete({ _id: currencyId });
    res.json({ message: "Currency deleted successfully" });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to delete currency", error: error.message });
  }
};
