const express = require("express");
const router = express.Router();

const flightsRoutes = require("./../domains/flights");
const hotelsRoutes = require("./../domains/hotels");

router.use("/flights", flightsRoutes);
router.use("/hotels", hotelsRoutes);

module.exports = router;
