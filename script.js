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

  const staticFallbackFiles = [
    "test1.jpg",
    "test_png.png"
  ];

  function inferGitHubRepo() {
    const host = window.location.hostname;
    const pathParts = window.location.pathname.split('/').filter(Boolean);

    if (config.githubOwner && config.githubRepo) {
      return {
        owner: config.githubOwner,
        repo: config.githubRepo,
        branch: config.branch || defaultConfig.branch
      };
    }

    if (!host.endsWith('.github.io')) {
      return {
        owner: defaultConfig.githubOwner,
        repo: defaultConfig.githubRepo,
        branch: defaultConfig.branch
      };
    }

    const owner = host.replace('.github.io', '');
    const repo = pathParts.length > 0 ? pathParts[0] : `${owner}.github.io`;

    return {
      owner,
      repo,
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

  function imageObjectFromPath(repoInfo, path, source) {
    const cleanPath = path.replace(/^\/+/, '');
    const name = cleanPath.split('/').pop();
    const branch = repoInfo.branch || defaultConfig.branch;

    let src;
    if (source === 'jsdelivr') {
      src = `https://cdn.jsdelivr.net/gh/${repoInfo.owner}/${repoInfo.repo}@${branch}/${encodePath(cleanPath)}`;
    } else {
      src = `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${branch}/${encodePath(cleanPath)}`;
    }

    return {
      name,
      title: humanizeFilename(name),
      src
    };
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      headers: { Accept: 'application/json, application/vnd.github+json' },
      cache: options.cache || 'default'
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
      .filter((image) => {
        const key = image.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }

  async function fetchFromJsDelivr(repoInfo) {
    const branch = repoInfo.branch || defaultConfig.branch;
    const folder = getFolder();
    const urls = [
      `https://data.jsdelivr.com/v1/package/gh/${repoInfo.owner}/${repoInfo.repo}@${branch}/flat`,
      `https://data.jsdelivr.com/v1/package/gh/${repoInfo.owner}/${repoInfo.repo}@${branch}`
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
          .map((path) => imageObjectFromPath(repoInfo, path, 'jsdelivr'));

        if (images.length) return uniqueImages(images);
      } catch (error) {
        continue;
      }
    }

    return [];
  }

  async function fetchFromGitHubContents(repoInfo) {
    const branch = repoInfo.branch || defaultConfig.branch;
    const folder = getFolder();
    const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${folder}?ref=${encodeURIComponent(branch)}`;

    try {
      const files = await fetchJson(url, { cache: 'default' });
      if (!Array.isArray(files)) return [];

      return uniqueImages(
        files
          .filter((file) => file.type === 'file' && isImageFile(file.name))
          .map((file) => ({
            name: file.name,
            title: humanizeFilename(file.name),
            src: file.download_url || imageObjectFromPath(repoInfo, `${folder}/${file.name}`, 'github').src
          }))
      );
    } catch (error) {
      return [];
    }
  }

  async function fetchFromGitHubTree(repoInfo) {
    const branch = repoInfo.branch || defaultConfig.branch;
    const folder = getFolder();
    const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;

    try {
      const data = await fetchJson(url, { cache: 'default' });
      const tree = Array.isArray(data.tree) ? data.tree : [];
      return uniqueImages(
        tree
          .filter((item) => item.type === 'blob')
          .map((item) => item.path || '')
          .filter((path) => path.startsWith(`${folder}/`))
          .filter(isImageFile)
          .map((path) => imageObjectFromPath(repoInfo, path, 'github'))
      );
    } catch (error) {
      return [];
    }
  }

  function staticFallback(repoInfo) {
    const folder = getFolder();
    return uniqueImages(
      staticFallbackFiles
        .filter(isImageFile)
        .map((name) => imageObjectFromPath(repoInfo, `${folder}/${name}`, 'github'))
    );
  }

  async function fetchGalleryImages() {
    const repoInfo = inferGitHubRepo();

    const jsDelivrImages = await fetchFromJsDelivr(repoInfo);
    if (jsDelivrImages.length) return jsDelivrImages;

    const contentsImages = await fetchFromGitHubContents(repoInfo);
    if (contentsImages.length) return contentsImages;

    const treeImages = await fetchFromGitHubTree(repoInfo);
    if (treeImages.length) return treeImages;

    return staticFallback(repoInfo);
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

      img.addEventListener('error', () => {
        figure.remove();
        if (!grid.querySelector('.gallery-item')) {
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
