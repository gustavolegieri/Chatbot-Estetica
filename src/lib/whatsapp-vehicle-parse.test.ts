import test from "node:test";
import assert from "node:assert/strict";
import { detectVehicleCompletion, isValidVehiclePlate, parsePlateFromText, parseVehicleMessage } from "./whatsapp-vehicle-parse";

test("recognizes Brazilian old and Mercosul plates", () => {
  assert.equal(parsePlateFromText("Honda Fit 2020, prata, placa BRA-2E19"), "BRA2E19");
  assert.equal(parsePlateFromText("Civic 2018 ABC 1234 preto"), "ABC1234");
  assert.equal(isValidVehiclePlate("ABC-1234"), true);
  assert.equal(isValidVehiclePlate("AB12C34"), false);
});

test("removes the plate from the parsed model", () => {
  const parsed = parseVehicleMessage("Honda Fit 2020, prata, bom estado, BRA2E19");
  assert.equal(parsed.plate, "BRA2E19");
  assert.doesNotMatch(parsed.model, /BRA2E19/);
});

test("does not complete vehicle collection without a plate", () => {
  const withoutPlate = parseVehicleMessage("Honda Civic 2021, preto, bom estado");
  const withPlate = parseVehicleMessage("Honda Civic 2021, preto, bom estado, BRA2E19");
  assert.equal(detectVehicleCompletion(withoutPlate), false);
  assert.equal(detectVehicleCompletion(withPlate), true);
});

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
