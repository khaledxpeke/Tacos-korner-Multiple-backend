const express = require("express");
const router = express.Router();
const currencyController = require("../controllers/currency.controller");
const {  roleAuth } = require("../middleware/auth");
const { USER_ROLES } = require("../enum/constants");

router.get("/", roleAuth(USER_ROLES.ADMIN), currencyController.getCurrencies);

router.post("/",  roleAuth(USER_ROLES.ADMIN), currencyController.createCurrency);

router.put("/:currencyId",  roleAuth(USER_ROLES.ADMIN), currencyController.updateCurrency);

router.delete("/:code",  roleAuth(USER_ROLES.ADMIN), currencyController.deleteCurrency);


module.exports = router;