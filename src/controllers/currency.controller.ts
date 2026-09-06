import type { Request, Response } from "express";
import { Currency } from "../models/currency.model";
import { errorMessage } from "../utils/helpers";

export const getCurrencies = async (_req: Request, res: Response) => {
  try {
    const currencies = await Currency.find({ isActive: true }).sort({
      createdAt: -1,
    });
    res.json(currencies);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch currencies", error: errorMessage(error) });
  }
};

export const createCurrency = async (req: Request, res: Response) => {
  try {
    const { code, name, symbol } = req.body;

    const existing = await Currency.findOne({ code: String(code).toUpperCase() });
    if (existing) {
      return res.status(400).json({ message: "Currency code already exists" });
    }

    const currency = new Currency({
      code: String(code).toUpperCase(),
      name,
      symbol,
    });

    await currency.save();
    res.status(201).json(currency);
  } catch (error) {
    res.status(500).json({ message: "Failed to create currency", error: errorMessage(error) });
  }
};

export const updateCurrency = async (req: Request, res: Response) => {
  try {
    const { currencyId } = req.params;
    const { code, name, symbol, isActive } = req.body;

    const currency = await Currency.findOneAndUpdate(
      { _id: currencyId },
      { code: String(code).toUpperCase(), name, symbol, isActive },
      { new: true }
    );

    if (!currency) {
      return res.status(404).json({ message: "Currency not found" });
    }

    res.status(200).json(currency);
  } catch (error) {
    res.status(500).json({ message: "Failed to update currency", error: errorMessage(error) });
  }
};

export const deleteCurrency = async (req: Request, res: Response) => {
  try {
    const { currencyId } = req.params;
    await Currency.findOneAndDelete({ _id: currencyId });
    res.json({ message: "Currency deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete currency", error: errorMessage(error) });
  }
};
