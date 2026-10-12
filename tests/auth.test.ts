import assert from "node:assert/strict";
import test from "node:test";
import { newPasswordSchema, recoveryTokenSchema } from "../src/domain/auth";
import { uyuToMinor } from "../src/domain/money";
test("recuperación: token estricto, contraseña robusta y confirmación coincidente",()=>{
  const values={password:"contraseña-larga-prueba",confirmPassword:"contraseña-larga-prueba",tokenHash:"a".repeat(64)};
  assert.ok(newPasswordSchema.safeParse(values).success);
  assert.equal(newPasswordSchema.safeParse({...values,confirmPassword:"otra"}).success,false);
  assert.equal(newPasswordSchema.safeParse({...values,password:"1234",confirmPassword:"1234"}).success,false);
  for(const token of ["", "https://malicioso.invalid", "<script>","a".repeat(129)]) assert.equal(recoveryTokenSchema.safeParse(token).success,false);
  assert.equal(newPasswordSchema.safeParse({...values,role:"owner"}).success,false);
});
test("precios administrativos: conversión decimal exacta sin redondeos flotantes",()=>{
  assert.equal(uyuToMinor("1000"),100000);assert.equal(uyuToMinor("432.12"),43212);assert.equal(uyuToMinor("0.01"),1);
  for(const value of ["-1","1.001","1e3","Infinity","",1000]) assert.throws(()=>uyuToMinor(value));
});
