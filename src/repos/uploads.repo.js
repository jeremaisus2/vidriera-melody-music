import { randomUUID } from 'crypto';
import sharp from 'sharp';
import { supabaseAdmin } from '../config/supabase.js';

const BUCKET = 'vidriera-imagenes';

// Ancho/alto máximo y calidad pensados para que ~100 imágenes entren cómodas
// en el 1 GB del plan free de Supabase (cada archivo queda típicamente entre
// 50 KB y 300 KB en webp, muy lejos del límite de 5MB del bucket).
const MAX_DIMENSION = 1600;
const LOGO_DIMENSION = 400; // ícono/logo cuadrado, más chico que una portada
const CALIDAD_WEBP = 75;

/**
 * Comprime la imagen recibida y la sube al bucket. Devuelve la URL pública.
 * La subida siempre corre con supabaseAdmin: el bucket no tiene políticas de
 * escritura para anon/authenticated (ver scripts/setup-storage.mjs).
 *
 * `tipo` distingue el único procesamiento que realmente difiere entre usos:
 *   - 'portada' (default): "fit: inside" — conserva el aspect ratio original,
 *     pensado para la imagen de portada de la tarjeta.
 *   - 'logo': "fit: cover" a un cuadrado fijo — el logo es un ícono cuadrado,
 *     no una foto libre, así que se recorta al centro en vez de dejar bordes.
 * En ambos casos es el mismo bucket/mecanismo de compresión (webp, misma
 * calidad); solo cambia el resize.
 */
export async function subirImagen(buffer, { academia_id, tipo = 'portada' }) {
  const resizeOpts = tipo === 'logo'
    ? { width: LOGO_DIMENSION, height: LOGO_DIMENSION, fit: 'cover' }
    : { width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true };

  const comprimida = await sharp(buffer)
    .rotate() // respeta la orientación EXIF antes de recomprimir
    .resize(resizeOpts)
    .webp({ quality: CALIDAD_WEBP })
    .toBuffer();

  const path = `${academia_id}/${tipo}-${randomUUID()}.webp`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, comprimida, { contentType: 'image/webp', upsert: false });
  if (error) throw error;

  const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path, bytes: comprimida.length };
}
