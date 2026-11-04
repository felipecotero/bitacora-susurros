# Bitácora · Susurros. Voces ocultas

Primer ensayo de una **bitácora de una investigación del colectivo Fragua hacia la instalación artística «Susurros. Voces ocultas»**. Reorganiza los materiales y encuentros del recorrido desde la curiosidad de quien los visita. La nube ofrece otra manera de acercarse a las personas, materiales y saberes que sostienen la escena. Sirve para probar la experiencia antes de incorporar las selecciones y registros definitivos del equipo.

## Sitio en línea

[Visitar la bitácora](https://felipecotero.github.io/bitacora-susurros/)

## Abrir el prototipo

Desde esta carpeta:

```sh
python3 -m http.server 4173
```

Abrir `http://localhost:4173`. La web es estática, sin dependencias ni proceso de compilación. GitHub Pages publica directamente la raíz de la rama `main`. El archivo `.nojekyll` permite servir estos archivos sin transformación. Los cambios que se publiquen en `main` actualizan el sitio automáticamente.

## Qué permite ensayar

- Girar la nube con el arrastre y acercarse o alejarse con la rueda. Las palabras mantienen trazos horizontales o verticales, con algunas invertidas, incluso al mirar desde atrás. Su distribución cambia con cada recarga y se conserva durante esa visita.
- Observar una respiración lenta, sutil e irregular por zonas, con pequeños adelantos y retardos entre palabras y retenciones ocasionales. La escena sigue respirando durante el arrastre y mientras se lee una ficha. Al girar, algunas palabras se rezagan levemente y siempre alcanzan su posición final. La pausa y la preferencia de movimiento reducido permiten detener la respiración.
- Abrir las fichas de palabras como placas flotantes de resina translúcida, con refracción y desenfoque del fondo. Las imágenes se alojan dentro de un borde con relieve y deformación óptica suave.
- Recorrer «Lugares»: un contorno flotante de Colombia, sin relleno, con ocho nodos de ciudad y personas vinculadas. Bogotá reúne tres personajes de prueba. Las ubicaciones son ficticias y una persona puede tener vínculos con varias ciudades.
- Rozar el mapa con el puntero: el contorno, sus puntos y los nombres acompañan suavemente la dirección del gesto. Un eco amortiguado los devuelve al centro, siempre derechos; el movimiento se desactiva con la preferencia de movimiento reducido.
- Abrir textos, estudios visuales y texturas sonoras. Las imágenes ilustrativas y el sonido sintetizado están identificados como demostraciones, no como registros de campo.
- Activar constelaciones por creador y recorrer los cinco nudos: **Talleres, Trasescena, Con-texto, Maridajes y Un hacer paralelo**. El quinto se incorporó al ampliar el primer planteamiento de cuatro nudos.
- Leer un sentido general de cada palabra y otro relacionado con la persona seleccionada, cuando exista ese vínculo.
- Añadir una palabra, selecciones, un texto y, opcionalmente, una imagen o un audio y una relación con un creador mediante «Añadir un apunte».

La base contiene **48 palabras y seis creadores ficticios**. Los cuatro selectores son Rafael Arévalo Peñuela, Mónica Bastos y dos nombres pendientes, señalados como Lectora 03 y Lector 04. Sus selecciones son de prueba.

El tamaño base sigue la fórmula `14 pt × 1,25^(selecciones − 1)`: **14; 17,5; 21,875; 27,34375 pt** para una, dos, tres o cuatro selecciones. La perspectiva modifica su tamaño aparente. La escena usa elementos de texto del navegador con transformaciones tridimensionales. Las posiciones se regeneran al abrir la página; el contenido guardado no cambia. El efecto óptico usa desplazamiento SVG y desenfoque de fondo, con una versión simplificada de vidrio para navegadores sin soporte del filtro.

Esta es la bitácora de una investigación del colectivo **Fragua**. El logo de **ARDE · Artistas de la Escenografía en Red** identifica una red amiga y enlaza a [ardered.com](https://ardered.com/); no atribuye a ARDE la autoría de la investigación. La interfaz permite combinar día/noche con imprenta/manuscrita: Archivo y Architects Daughter, ambas servidas localmente con sus licencias OFL. La elección se conserva en el navegador. Fragua y los logos conservan su identidad. Una misma textura atraviesa fondo, escritura, menús, botones y tarjetas; las capas que pasan al fondo pierden un poco de foco.

## Incorporar información

`places.json` define los vínculos ficticios entre ciudades y personas; la geometría del mapa y su fuente están en `media/colombia-outline.json`.

`data.json` reúne las palabras, selectores, creadores, nudos y relaciones. Cambiar esa base permite sustituir el contenido ficticio sin reconstruir la interfaz.

El formulario guarda el ensayo en `localStorage`, únicamente en ese navegador y para esa dirección web. **No envía aportes al equipo ni actualiza el archivo publicado.** «Exportar ensayo» descarga una copia JSON; «Cargar una copia» recupera una exportación validada. Conviene exportar antes de cambiar de equipo, dirección o borrar datos del navegador. Los adjuntos de prueba admitidos son PNG, JPEG, WebP, MP3, WAV y OGG, hasta 1,5 MB por archivo.

## Siguiente fase: carga compartida

Para recibir información del equipo se propone mantener el código público en GitHub y conectar la web a un servicio de contenidos:

1. Acceso mediante cuentas invitadas y permisos diferenciados para aportar, revisar y publicar.
2. Validación en el servidor de campos, formatos, tamaños, tipos de archivo y permisos de cada operación.
3. Archivos privados con enlaces temporales para revisión; publicación de los materiales aprobados según los permisos acordados con sus autores.
4. Historial de versiones, copias de respaldo y recuperación de contenido.

Las claves y credenciales se guardarán en el servicio, fuera del repositorio y del código que recibe el navegador. El editor local actual permite ensayar la metodología; todavía no constituye un sistema compartido de gestión de contenidos.

## Referencias

El enfoque toma como referencia un acta de trabajo del 3 de noviembre de 2026, pendiente de revisión de sus participantes, y la propuesta narrativa «Susurros. Voces ocultas». Esos documentos internos no forman parte de este repositorio. Los testimonios, personajes y selecciones de esta demostración no sustituyen la investigación.
