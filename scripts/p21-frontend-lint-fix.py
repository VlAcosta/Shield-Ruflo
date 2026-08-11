#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'src/features/acquisition/ReviewAcquisitionWorkspace.jsx'
text = path.read_text(encoding='utf-8')
old = '''  useEffect(() => {
    if (!selected) {
      setMetrics(null);
      setQrDataUrl('');
      return undefined;
    }
    const controller = new AbortController();
    getAcquisitionMetrics(selected.id, { signal: controller.signal }).then(setMetrics).catch((nextError) => {
      if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Не удалось загрузить метрики');
    });
    QRCode.toDataURL(selectedPublicUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
    setInvite(null);
    return () => controller.abort();
  }, [selected?.id, selectedPublicUrl]);
'''
new = '''  useEffect(() => {
    if (!selectedId) {
      setMetrics(null);
      setQrDataUrl('');
      return undefined;
    }
    const controller = new AbortController();
    getAcquisitionMetrics(selectedId, { signal: controller.signal }).then(setMetrics).catch((nextError) => {
      if (nextError?.name !== 'AbortError') setError(nextError?.message || 'Не удалось загрузить метрики');
    });
    QRCode.toDataURL(selectedPublicUrl, { width: 320, margin: 2, errorCorrectionLevel: 'M' }).then(setQrDataUrl).catch(() => setQrDataUrl(''));
    setInvite(null);
    return () => controller.abort();
  }, [selectedId, selectedPublicUrl]);
'''
if old not in text:
    raise SystemExit('P21 frontend lint-fix anchor not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('fixed acquisition metrics/QR effect dependencies')
