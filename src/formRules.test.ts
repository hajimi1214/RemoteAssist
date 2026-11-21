import assert from "node:assert/strict";
import test from "node:test";
import { passwordStrength, validateAuth, validateAuthField } from "./formRules.ts";

const values = { login: "test-user", username: "new-user", email: "you@example.com", password: "short!", confirm: "short!" };
test("sign in accepts an existing short password while registration keeps its minimum", () => {
  assert.deepEqual(validateAuth(values, "signin"), {});
  assert.match(validateAuth(values, "register").password ?? "", /8/);
  assert.ok(validateAuth({ ...values, password: "" }, "signin").password);
});
test("registration validates account fields and password confirmation", () => {
  assert.ok(validateAuthField("username", { ...values, username: "bad name" }, "register"));
  assert.ok(validateAuthField("email", { ...values, email: "@example.com" }, "register"));
  assert.ok(validateAuthField("confirm", { ...values, confirm: "different" }, "register"));
  assert.deepEqual(validateAuth({ ...values, password: "independent phrase", confirm: "independent phrase" }, "register"), {});
});
test("strength feedback warns about common sequences independently of validity", () => {
  assert.equal(passwordStrength("").level, 0);
  assert.equal(passwordStrength("1234567890").level, 1);
  assert.equal(passwordStrength("aaaaaaaaaaaaaaaa").level, 1);
  assert.equal(passwordStrength("any-eight").level, 2);
  assert.equal(passwordStrength("quiet river silver cloud").level, 3);
});
