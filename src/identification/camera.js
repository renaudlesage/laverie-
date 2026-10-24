// Adaptateur caméra : BarcodeDetector natif si disponible (Chrome Android), sinon @zxing/browser.
// Appelle onLecture({ technologie, valeur_brute, source: 'camera' }) à chaque code décodé.

const FORMATS_NATIFS = ['qr_code', 'data_matrix', 'code_128', 'code_39', 'ean_13', 'ean_8', 'itf', 'upc_a'];

function technologieNative(format) {
  if (format === 'qr_code') return 'qr';
  if (format === 'data_matrix') return 'datamatrix';
  return 'code_barres';
}

async function detecteurNatif() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const pris = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS_NATIFS.filter((f) => pris.includes(f));
    return formats.includes('qr_code') ? new window.BarcodeDetector({ formats }) : null;
  } catch {
    return null;
  }
}

const CONTRAINTES = { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false };

// Renvoie une fonction d'arrêt.
export async function demarrerCamera(video, onLecture) {
  const natif = await detecteurNatif();

  if (natif) {
    const flux = await navigator.mediaDevices.getUserMedia(CONTRAINTES);
    video.srcObject = flux;
    await video.play();
    let actif = true;
    const boucle = async () => {
      if (!actif) return;
      try {
        if (video.readyState >= 2) {
          for (const code of await natif.detect(video)) {
            onLecture({ technologie: technologieNative(code.format), valeur_brute: code.rawValue, source: 'camera' });
          }
        }
      } catch {
        // Image illisible : on réessaie à l'image suivante.
      }
      setTimeout(boucle, 150);
    };
    boucle();
    return () => {
      actif = false;
      flux.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }

  // Repli : chargé à la demande pour ne pas alourdir l'app.
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const technologieZxing = (format) =>
    format === BarcodeFormat.QR_CODE ? 'qr' : format === BarcodeFormat.DATA_MATRIX ? 'datamatrix' : 'code_barres';
  const indices = new Map([
    [
      DecodeHintType.POSSIBLE_FORMATS,
      [BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.ITF],
    ],
  ]);
  const lecteur = new BrowserMultiFormatReader(indices, { delayBetweenScanAttempts: 150 });
  const controles = await lecteur.decodeFromConstraints(CONTRAINTES, video, (resultat) => {
    if (resultat) {
      onLecture({ technologie: technologieZxing(resultat.getBarcodeFormat()), valeur_brute: resultat.getText(), source: 'camera' });
    }
  });
  return () => controles.stop();
}
