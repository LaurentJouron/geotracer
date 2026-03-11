/**
 * import.js — Import de fichiers GPX
 */

const Import = (() => {

  async function handleFile() {
    const file = document.getElementById('gpxFile').files[0];
    if (!file) return;

    toast('⏳ Import en cours...');
    try {
      const activity = await Api.importGpx(file);
      toast(`✅ ${activity.title} — ${activity.distance_km?.toFixed(1)} km`);
      setTimeout(() => window.location.href = 'activities.html', 1500);
    } catch {
      toast("Erreur lors de l'import GPX", 'error');
    }
  }

  function initDropzone() {
    const dz = document.getElementById('dropzone');
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
    dz.addEventListener('drop', e => {
      e.preventDefault();
      dz.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith('.gpx')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById('gpxFile').files = dt.files;
        handleFile();
      } else {
        toast('Seuls les fichiers .gpx sont acceptés', 'error');
      }
    });
  }

  return { handleFile, initDropzone };

})();
