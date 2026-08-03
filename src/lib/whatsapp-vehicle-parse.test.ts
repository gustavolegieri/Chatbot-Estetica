import test from "node:test";
import assert from "node:assert/strict";
import { parseVehicleMessage } from "./whatsapp-vehicle-parse";

test("parseVehicleMessage extracts all vehicle details from one natural message", () => {
  const vehicle = parseVehicleMessage("Honda Civic 2021, preto, bom estado");

  assert.equal(vehicle.model, "Honda Civic");
  assert.equal(vehicle.year, "2021");
  assert.equal(vehicle.color, "preto");
  assert.equal(vehicle.condition, "bom");
});

test("parseVehicleMessage understands a natural color correction", () => {
  const correction = parseVehicleMessage("a cor é branca");
  assert.equal(correction.color, "branca");
});

test("parseVehicleMessage recognizes expanded color vocabulary", () => {
  assert.equal(parseVehicleMessage("Corolla 2022 grafite bom estado").color, "grafite");
  assert.equal(parseVehicleMessage("Onix 2020 vermelha bom estado").color, "vermelha");
});
