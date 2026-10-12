import { z } from "zod";
export const recoveryTokenSchema=z.string().regex(/^[a-f0-9]{32,128}$/i);
export const newPasswordSchema=z.object({
  password:z.string().min(12,"Usá al menos 12 caracteres.").max(128),
  confirmPassword:z.string().max(128),tokenHash:recoveryTokenSchema,
}).strict().refine(value=>value.password===value.confirmPassword,{message:"Las contraseñas no coinciden.",path:["confirmPassword"]});
