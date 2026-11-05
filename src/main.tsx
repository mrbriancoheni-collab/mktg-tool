import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./styles.css";
import App from "./App";
import { LegalPage } from "./components/LegalPage";

const legal = location.pathname.match(/^\/legal\/([a-z-]+)\/?$/);

createRoot(document.getElementById("root")!).render(<StrictMode>{legal ? <LegalPage slug={legal[1]} /> : <App />}</StrictMode>);
