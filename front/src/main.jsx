import { StrictMode } from "react"; //ayuda a detectar malas practicas
import { createRoot } from "react-dom/client"; //inicia react
import "./index.css";
import App from "./App.jsx"; //componente principal
import { SearchProvider } from "./context/SearchContext.jsx"; //para que app pueda acceder al buscador

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <SearchProvider>
      <App />
    </SearchProvider>
  </StrictMode>,
);
