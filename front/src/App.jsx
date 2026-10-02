import { useState, useEffect } from "react";
import { useAppStore } from "./store/useAppStore";
import { useSearch } from "./context/SearchContext";
import { graphqlRequest } from "./graphql/client";
//import de layouts y componentes
import TopBar from "./components/layout/TopBar";
import Sidebar from "./components/layout/Sidebar";
import Hero from "./components/layout/Hero";
import Footer from "./components/layout/Footer";
//import de pantallas
import Home from "./components/Home";
import CategoryDetail from "./components/CategoryDetail";
import ProductDetail from "./components/ProductDetail";
import Cart from "./components/Cart";
import Checkout from "./components/Checkout";

//query para obtener categorias
const QUERY_CATEGORIAS = `query { categorias { id nombre imagenUrl } }`;

function App() {
  const screen = useAppStore((s) => s.screen); //permite conocer y obtener la pantalla actual
  const [categorias, setCategorias] = useState([]); //permite que la app guarde informacion que puede cambiar
  const { query } = useSearch(); //permite conocer que escribio el usuario en el buscador

  useEffect(() => {
    graphqlRequest(QUERY_CATEGORIAS) //enviamos la consulta
      .then((data) => setCategorias(data.categorias)) //guardamos la respuesta en el estado
      .catch((err) => console.error(err)); // si ocurre un error se muestra en la consola
  }, []); //los [] significan que solo se ejecuta al iniciar la app

  const categoriasFiltradas = categorias.filter(
    (c) => c.nombre.toLowerCase().includes(query.toLowerCase()), //filtra las categorias que contienen la palabra buscada
  );

  //parte visual
  return (
    <>
      {" "}
      {/*Los <> son fragmentos, permiten agrupar elementos sin crear un div extra*/}
      <TopBar />
      {/*Si screes es home muestra hero*/}
      {screen === "home" && <Hero />}
      <div style={{ display: "flex" }}>
        <Sidebar categorias={categoriasFiltradas} />
        <main style={{ flex: 1, minHeight: "80vh" }}>
          {/* dependiendo del valor muestra un componente */}
          {screen === "home" && <Home />}
          {screen === "category" && <CategoryDetail />}
          {screen === "product" && <ProductDetail />}
          {screen === "cart" && <Cart />}
          {screen === "checkout" && <Checkout />}
        </main>
      </div>
      <Footer />
    </>
  );
}

//permite que otros archivos puedan importar este componente
export default App;
