from payments import crear_preferencia_pago

try:
    resultado = crear_preferencia_pago()

    print("Preferencia creada correctamente")
    print("ID:", resultado.get("id"))
    print("URL:", resultado.get("sandbox_init_point") or resultado.get("init_point"))

except Exception as error:
    print("Error:", error)
