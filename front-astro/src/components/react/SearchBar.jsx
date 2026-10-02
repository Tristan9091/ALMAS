import { useState } from "react";

export default function SearchBar() {
  const [query, setQuery] = useState("");

  const handleSubmit = (event) => {
    event.preventDefault();

    const texto = query.trim();

    if (!texto) {
      window.location.href = "/";
      return;
    }

    window.location.href = `/?buscar=${encodeURIComponent(texto)}`;
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        flex: "0 1 320px",
        display: "flex",
      }}
    >
      <input
        type="search"
        placeholder="Buscar joyas..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        style={{
          width: "100%",
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
