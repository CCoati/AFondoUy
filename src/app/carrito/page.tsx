import type { Metadata } from "next";
import { CartReview } from "@/components/demo/cart-review";
export const metadata: Metadata = { title: "Mi selección · Demostración" };
export default function CartPage() { return <CartReview />; }
