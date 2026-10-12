import assert from "node:assert/strict";
import test from "node:test";
import { checkoutInput } from "../src/domain/reservation";
const valid={raffleId:"76e5aa7a-3edc-4e72-9fba-4f0f66d7ace1",idempotencyKey:"cef73724-85c5-4947-a2b1-e35f0d75904e",numbers:[1,200],expectedTotalMinor:200000,fullName:"Prueba local",email:"test@example.invalid",phone:"099000000",consent:true,paymentMethod:"mercadopago" as const};
test("checkout: valida contacto y consentimiento; rechaza descuentos enviados por el cliente",()=>{
  assert.equal(checkoutInput.safeParse(valid).success,true);
  for(const change of [{consent:false},{email:"invalid"},{phone:"abc"},{paymentMethod:"card"},{numbers:[1,1]},{numbers:[0]},{numbers:Array.from({length:21},(_,i)=>i+1)},{expectedTotalMinor:-1},{discountMinor:10000},{fullName:" "}]) assert.equal(checkoutInput.safeParse({...valid,...change}).success,false);
});
