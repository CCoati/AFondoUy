import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedRequestOrigin } from "../src/domain/request-origin";

test("acepta el dominio de la solicitud Netlify aunque NEXT_PUBLIC_SITE_URL no esté configurada", () => {
  assert.equal(
    isAllowedRequestOrigin("https://afondo-uy.netlify.app", "https://afondo-uy.netlify.app/api/reservas", ["http://localhost:3000"]),
    true,
  );
});

test("acepta el dominio principal de Netlify detrás de un host interno", () => {
  assert.equal(
    isAllowedRequestOrigin("https://rifas.afondouy.com", "http://127.0.0.1:8888/api/reservas", ["https://rifas.afondouy.com"]),
    true,
  );
});

test("permite una URL de Deploy Preview configurada y rechaza otros sitios", () => {
  const configured = ["https://afondo-uy.netlify.app", "https://deploy-preview-42--afondo-uy.netlify.app"];
  assert.equal(isAllowedRequestOrigin("https://deploy-preview-42--afondo-uy.netlify.app", "http://127.0.0.1:8888/api", configured), true);
  assert.equal(isAllowedRequestOrigin("https://attacker.invalid", "https://afondo-uy.netlify.app/api", configured), false);
});

test("rechaza Origin ausente, malformado o con ruta añadida", () => {
  const configured = ["https://afondo-uy.netlify.app"];
  assert.equal(isAllowedRequestOrigin(null, "https://afondo-uy.netlify.app/api", configured), false);
  assert.equal(isAllowedRequestOrigin("invalid", "https://afondo-uy.netlify.app/api", configured), false);
  assert.equal(isAllowedRequestOrigin("https://afondo-uy.netlify.app/path", "https://afondo-uy.netlify.app/api", configured), false);
});

test("mantiene los orígenes locales únicamente en desarrollo", () => {
  assert.equal(isAllowedRequestOrigin("http://localhost:3000", "http://127.0.0.1:3000/api", [], true), true);
  assert.equal(isAllowedRequestOrigin("http://localhost:3000", "http://127.0.0.1:3000/api", [], false), false);
});
