import { useState } from "react";
import { rutaLocalizada } from "../../i18n/utils";

export default function SearchBar({ idioma = "es" }) {
  const [query, setQuery] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    const texto = query.trim();
    const inicio = rutaLocalizada("/", idioma);

    window.location.href = texto
      ? `${inicio}?buscar=${encodeURIComponent(texto)}`
      : inicio;
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        width: "100%",
        display: "flex",
        minWidth: 0,
      }}
    >
      <input
        type="search"
        placeholder={idioma === "en" ? "Search jewelry..." : "Buscar joyas..."}
        aria-label={idioma === "en" ? "Search jewelry" : "Buscar joyas"}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{
          width: "100%",
          minWidth: 0,
          padding: "0.5rem 1.2rem",
          borderRadius: "999px",
          border: "1px solid rgba(253, 240, 220, 0.3)",
          backgroundColor: "rgba(253, 240, 220, 0.08)",
          color: "#fff",
        }}
      />
    </form>
  );
}
