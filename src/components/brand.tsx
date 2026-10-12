import Image from "next/image";
import Link from "next/link";
export function Brand() {
  return <Link href="/" className="brand" aria-label="A FONDO UY — inicio"><span className="official-logo"><Image src="/logo.png" alt="A FONDO UY" fill sizes="190px" loading="eager" /></span></Link>;
}
