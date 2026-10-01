BEGIN TRANSACTION;
CREATE TABLE categoria (
	id INTEGER NOT NULL, 
	nombre VARCHAR NOT NULL, 
	imagen_url VARCHAR, 
	PRIMARY KEY (id)
);
INSERT INTO "categoria" VALUES(1,'Anillos','https://www.melissagutierrez.com.mx/cdn/shop/files/ArgollasOroRosa4y2mmPlanasCepilladas01.jpg?v=1724103635');
INSERT INTO "categoria" VALUES(2,'Collares','https://lumai.com.mx/cdn/shop/files/Screenshot2026-08-28at7.33.19PM.png?v=1788194336');
INSERT INTO "categoria" VALUES(3,'Aretes','https://swarovskimexico.vtexassets.com/arquivos/ids/208736-800-auto?v=638697110410730000&width=800&height=auto&aspect=true');
CREATE TABLE detallepedido (
	id INTEGER NOT NULL, 
	cantidad INTEGER NOT NULL, 
	precio_unitario FLOAT NOT NULL, 
	pedido_id INTEGER NOT NULL, 
	producto_id INTEGER NOT NULL, 
	variante_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(pedido_id) REFERENCES pedido (id), 
	FOREIGN KEY(producto_id) REFERENCES producto (id), 
	FOREIGN KEY(variante_id) REFERENCES variante (id)
);
CREATE TABLE pedido (
	id INTEGER NOT NULL, 
	nombre_comprador VARCHAR NOT NULL, 
	email_comprador VARCHAR NOT NULL, 
	direccion_envio VARCHAR NOT NULL, 
	estatus VARCHAR NOT NULL, 
	total FLOAT NOT NULL, 
	fecha DATETIME NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE producto (
	id INTEGER NOT NULL, 
	nombre VARCHAR NOT NULL, 
	descripcion VARCHAR NOT NULL, 
	precio FLOAT NOT NULL, 
	imagen_url VARCHAR NOT NULL, 
	stock INTEGER NOT NULL, 
	categoria_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(categoria_id) REFERENCES categoria (id)
);
INSERT INTO "producto" VALUES(1,'Anillo de Oro','Anillo artesanal bañado en oro',899.0,'https://i.etsystatic.com/10797896/r/il/d68c69/3676765048/il_570xN.3676765048_gwhf.jpg',10,1);
INSERT INTO "producto" VALUES(2,'Anillo de Plata con Cuarzo','Anillo artesanal de plata .925 con cuarzo rosa',550.0,'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR9gG51Kqo7PTc-SiMAz6FAGa9CS1kD7s2wbWULeVkhHIB2EItwmJniakZ5&s=10',12,1);
INSERT INTO "producto" VALUES(3,'Collar de Plata','Collar artesanal de plata .925',650.0,'https://cdn-media.glamira.com/media/product/newgeneration/view/1/sku/14976edand/diamond/diamond-zirconia_AAAAA/alloycolour/white.jpg',8,2);
INSERT INTO "producto" VALUES(4,'Collar de Oro con Dije','Collar bañado en oro con dije de luna',780.0,'https://i.etsystatic.com/27972495/r/il/68870a/3257987378/il_570xN.3257987378_gqok.jpg',6,2);
INSERT INTO "producto" VALUES(5,'Aretes de Perla','Aretes con perla cultivada',420.0,'https://cdn.onecklace.com/products/2733/product_2733_1_730.jpeg',15,3);
INSERT INTO "producto" VALUES(6,'Aretes Colgantes de Oro','Aretes largos bañados en oro',510.0,'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRenNCaokM6ANrY34m9GPSOnlvOgr8futsz6hZN1LcZFQ&s',9,3);
CREATE TABLE variante (
	id INTEGER NOT NULL, 
	tipo VARCHAR NOT NULL, 
	valor VARCHAR NOT NULL, 
	producto_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(producto_id) REFERENCES producto (id)
);
INSERT INTO "variante" VALUES(1,'talla','6',1);
INSERT INTO "variante" VALUES(2,'talla','7',1);
INSERT INTO "variante" VALUES(3,'talla','8',1);
INSERT INTO "variante" VALUES(4,'talla','7',2);
INSERT INTO "variante" VALUES(5,'talla','8',2);
COMMIT;
