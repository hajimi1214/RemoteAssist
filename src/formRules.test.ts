import assert from "node:assert/strict";
import test from "node:test";
import { editConnectionCode, passwordStrength, validateAuth, validateAuthField } from "./formRules.ts";

const values = { login: "test-user", username: "new-user", email: "you@example.com", password: "short!", confirm: "short!", consent: true };
test("sign in accepts an existing short password while registration keeps its minimum", () => {
  assert.deepEqual(validateAuth(values, "signin"), {});
  assert.match(validateAuth(values, "register").password ?? "", /8/);
  assert.ok(validateAuth({ ...values, password: "" }, "signin").password);
});
test("registration validates individual fields, confirmation, and explicit consent", () => {
  assert.ok(validateAuthField("username", { ...values, username: "bad name" }, "register"));
  assert.ok(validateAuthField("email", { ...values, email: "@example.com" }, "register"));
  assert.ok(validateAuthField("confirm", { ...values, confirm: "different" }, "register"));
  assert.ok(validateAuthField("consent", { ...values, consent: false }, "register"));
  assert.deepEqual(validateAuth({ ...values, password: "independent phrase", confirm: "independent phrase" }, "register"), {});
});
test("strength feedback warns about common sequences independently of validity", () => {
  assert.equal(passwordStrength("").level, 0);
  assert.equal(passwordStrength("1234567890").level, 1);
  assert.equal(passwordStrength("aaaaaaaaaaaaaaaa").level, 1);
  assert.equal(passwordStrength("any-eight").level, 2);
  assert.equal(passwordStrength("quiet river silver cloud").level, 3);
});
test("eight-digit paste replaces the full connection code from any position", () => {
  assert.deepEqual(editConnectionCode("98765432", 3, "１２３４ ５６７８"), { value: "12345678", focus: 7 });
  assert.deepEqual(editConnectionCode("", 0, "1234-5678"), { value: "12345678", focus: 7 });
});
test("editing and deletion retain digit positions for safe correction", () => {
  assert.deepEqual(editConnectionCode("12345678", 2, "wrong paste"), { value: "12345678", focus: 2 });
  assert.deepEqual(editConnectionCode("12345678", 2, ""), { value: "12 45678", focus: 2 });
  assert.deepEqual(editConnectionCode("12 45678", 2, "9"), { value: "12945678", focus: 3 });
  assert.deepEqual(editConnectionCode("12345678", 7, ""), { value: "1234567", focus: 7 });
});
