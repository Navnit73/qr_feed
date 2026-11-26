import type { Metadata } from "next"
import DesignPage from "./design/page"

export const metadata: Metadata = {
  title: "QR Feed · Colour theme",
  description: "The QR Feed colour theme and palette.",
}

// Until the app screens exist, the home page shows the colour theme and palette.
export default DesignPage
