import os

import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()

cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)


def subir_imagen(archivo):
    resultado = cloudinary.uploader.upload(
        archivo,
        folder="almas/productos",
        resource_type="image",
    )

    return {
        "url": resultado["secure_url"],
        "public_id": resultado["public_id"],
    }