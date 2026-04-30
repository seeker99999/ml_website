(function () {
  const defaultConfig = {
    githubOwner: "seeker99999",
    githubRepo: "ml_website",
    branch: "main",
    labPicsFolder: "lab_pics"
  };

  const config = {
    ...defaultConfig,
    ...(window.MORRISON_LAB_SITE_CONFIG || {})
  };

  const knownFiles = [
    "test1.jpg",
    "test_png.png"
  ];

  function inferGitHubRepo() {
    return {
      owner: config.githubOwner || defaultConfig.githubOwner,
      repo: config.githubRepo || defaultConfig.githubRepo,
      branch: config.branch || defaultConfig.branch
    };
  }

  function getFolder() {
    return (config.labPicsFolder || defaultConfig.labPicsFolder).replace(/^\/+|\/+$/g, '');
  }

  function humanizeFilename(filename) {
    return filename
      .replace(/\.[^.]+$/, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function isImageFile(name) {
    return /\.(jpe?g|png|webp|gif)$/i.test(name);
  }

  function statusMessage(type, message) {
    const status = document.getElementById('gallery-status');
    if (!status) return;
    if (!message) {
      status.hidden = true;
      status.className = 'gallery-status';
      status.innerHTML = '';
      return;
    }
    status.hidden = false;
    status.className = `gallery-status ${type || ''}`.trim();
    status.innerHTML = message;
  }

  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function sameSiteImage(path, cacheKey) {
    const cleanPath = path.replace(/^\/+/, '');
    return `${encodePath(cleanPath)}?v=${encodeURIComponent(cacheKey)}`;
  }

  function imageObjectFromPath(path, cacheKey) {
    const cleanPath = path.replace(/^\/+/, '');
    const name = cleanPath.split('/').pop();

    return {
      name,
      title: humanizeFilename(name),
      src: sameSiteImage(cleanPath, cacheKey)
    };
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json, application/vnd.github+json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      const error = new Error(`${response.status}`);
      error.status = response.status;
      error.url = url;
      throw error;
    }

    return response.json();
  }

  function uniqueImages(images) {
    const seen = new Set();
    return images
      .filter((image) => image && image.name && isImageFile(image.name))
      .filter((image) => {
        const key = image.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async function fetchFromGitHubContents(repoInfo, cacheKey) {
    const folder = getFolder();
    const branch = repoInfo.branch || defaultConfig.branch;
    const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${folder}?ref=${encodeURIComponent(branch)}&_=${encodeURIComponent(cacheKey)}`;

    try {
      const files = await fetchJson(url);
      if (!Array.isArray(files)) return [];

      return uniqueImages(
        files
          .filter((file) => file.type === 'file' && isImageFile(file.name))
          .map((file) => imageObjectFromPath(`${folder}/${file.name}`, cacheKey))
      );
    } catch (error) {
      return [];
    }
  }

  async function fetchFromGitHubTree(repoInfo, cacheKey) {
    const folder = getFolder();
    const branch = repoInfo.branch || defaultConfig.branch;
    const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1&_=${encodeURIComponent(cacheKey)}`;

    try {
      const data = await fetchJson(url);
      const tree = Array.isArray(data.tree) ? data.tree : [];

      return uniqueImages(
        tree
          .filter((item) => item.type === 'blob')
          .map((item) => item.path || '')
          .filter((path) => path.startsWith(`${folder}/`))
          .filter(isImageFile)
          .map((path) => imageObjectFromPath(path, cacheKey))
      );
    } catch (error) {
      return [];
    }
  }

  async function fetchFromJsDelivr(repoInfo, cacheKey) {
    const folder = getFolder();
    const branch = repoInfo.branch || defaultConfig.branch;
    const urls = [
      `https://data.jsdelivr.com/v1/package/gh/${repoInfo.owner}/${repoInfo.repo}@${branch}/flat?t=${encodeURIComponent(cacheKey)}`,
      `https://data.jsdelivr.com/v1/package/gh/${repoInfo.owner}/${repoInfo.repo}@${branch}?t=${encodeURIComponent(cacheKey)}`
    ];

    for (const url of urls) {
      try {
        const data = await fetchJson(url);
        const files = Array.isArray(data.files) ? data.files : [];
        const images = files
          .map((file) => {
            if (typeof file === 'string') return file;
            return file.name || file.path || '';
          })
          .map((path) => path.replace(/^\/+/, ''))
          .filter((path) => path.startsWith(`${folder}/`))
          .filter(isImageFile)
          .map((path) => imageObjectFromPath(path, cacheKey));

        if (images.length) return uniqueImages(images);
      } catch (error) {
        continue;
      }
    }

    return [];
  }

  async function fetchFromOptionalManifest(cacheKey) {
    const folder = getFolder();
    const manifestUrl = `${folder}/gallery.json?v=${encodeURIComponent(cacheKey)}`;

    try {
      const files = await fetchJson(manifestUrl);
      if (!Array.isArray(files)) return [];

      return uniqueImages(
        files
          .filter((name) => typeof name === 'string')
          .filter(isImageFile)
          .map((name) => imageObjectFromPath(`${folder}/${name}`, cacheKey))
      );
    } catch (error) {
      return [];
    }
  }

  function fallbackKnownFiles(cacheKey) {
    const folder = getFolder();
    return uniqueImages(
      knownFiles
        .filter(isImageFile)
        .map((name) => imageObjectFromPath(`${folder}/${name}`, cacheKey))
    );
  }

  async function fetchGalleryImages() {
    const repoInfo = inferGitHubRepo();
    const cacheKey = Date.now().toString();

    // Optional local manifest. If present, it is the fastest and most reliable.
    const manifestImages = await fetchFromOptionalManifest(cacheKey);
    if (manifestImages.length) return manifestImages;

    // GitHub discovery. Images are displayed from the same GitHub Pages site, not raw.githubusercontent.com.
    const contentsImages = await fetchFromGitHubContents(repoInfo, cacheKey);
    if (contentsImages.length) return contentsImages;

    const treeImages = await fetchFromGitHubTree(repoInfo, cacheKey);
    if (treeImages.length) return treeImages;

    const jsDelivrImages = await fetchFromJsDelivr(repoInfo, cacheKey);
    if (jsDelivrImages.length) return jsDelivrImages;

    return fallbackKnownFiles(cacheKey);
  }

  function renderGallery(images) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!images.length) {
      statusMessage('warning', `No images were found in <code>${getFolder()}</code>.`);
      return;
    }

    statusMessage('', '');

    let loadedCount = 0;
    let attemptedCount = images.length;

    images.forEach((image) => {
      const figure = document.createElement('figure');
      figure.className = 'gallery-item';

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gallery-image-button';
      button.setAttribute('aria-label', `Open ${image.title}`);

      const img = document.createElement('img');
      img.src = image.src;
      img.alt = image.title;
      img.loading = 'lazy';

      img.addEventListener('load', () => {
        loadedCount += 1;
        statusMessage('', '');
      }, { once: true });

      img.addEventListener('error', () => {
        figure.remove();
        attemptedCount -= 1;
        if (attemptedCount <= 0 && loadedCount === 0) {
          statusMessage('warning', `No gallery images could be loaded from <code>${getFolder()}</code>.`);
        }
      }, { once: true });

      const caption = document.createElement('figcaption');
      caption.textContent = image.title;

      button.appendChild(img);
      figure.appendChild(button);
      figure.appendChild(caption);
      grid.appendChild(figure);

      button.addEventListener('click', () => openDialog(image));
    });
  }

  async function loadGallery() {
    if (document.body.dataset.page !== 'lab-pics') return;
    statusMessage('', 'Loading lab photos…');

    try {
      const images = await fetchGalleryImages();
      renderGallery(images);
    } catch (error) {
      statusMessage('error', 'Unable to load lab photos.');
    }
  }

  function openDialog(image) {
    const dialog = document.getElementById('image-dialog');
    const dialogImage = document.getElementById('dialog-image');
    const dialogCaption = document.getElementById('dialog-caption');
    if (!dialog || !dialogImage || !dialogCaption) return;

    dialogImage.src = image.src;
    dialogImage.alt = image.title;
    dialogCaption.textContent = image.title;
    dialog.showModal();
  }

  function setupDialog() {
    const dialog = document.getElementById('image-dialog');
    const closeButton = document.querySelector('.dialog-close');

    if (!dialog || !closeButton) return;

    closeButton.addEventListener('click', () => dialog.close());

    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const clickedBackdrop =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;

      if (clickedBackdrop) dialog.close();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupDialog();
    loadGallery();

    const refresh = document.getElementById('refresh-gallery');
    if (refresh) {
      refresh.addEventListener('click', loadGallery);
    }
  });
})();
