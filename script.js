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

  function getFolder() {
    return (config.labPicsFolder || defaultConfig.labPicsFolder).replace(/^\/+|\/+$/g, '');
  }

  function contentApiUrls(repoInfo) {
    const folder = getFolder();
    const base = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${folder}`;
    const urls = [];
    if (repoInfo.branch) urls.push(`${base}?ref=${encodeURIComponent(repoInfo.branch)}`);
    urls.push(base);
    return [...new Set(urls)];
  }

  function treeApiUrls(repoInfo) {
    const branch = repoInfo.branch || defaultConfig.branch;
    return [
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
      `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/trees/HEAD?recursive=1`
    ];
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      cache: 'no-store'
    });
    if (!response.ok) {
      const error = new Error(`GitHub API returned ${response.status} for ${url}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function fetchFromContentsApi(repoInfo) {
    for (const url of contentApiUrls(repoInfo)) {
      try {
        const files = await fetchJson(url);
        if (!Array.isArray(files)) continue;
        return files
          .filter((file) => file.type === 'file' && isImageFile(file.name))
          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
          .map((file) => ({
            name: file.name,
            title: humanizeFilename(file.name),
            src: file.download_url || `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${repoInfo.branch || defaultConfig.branch}/${getFolder()}/${encodeURIComponent(file.name)}`
          }));
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
    return null;
  }

  async function fetchFromTreeApi(repoInfo) {
    const folder = getFolder();
    const branch = repoInfo.branch || defaultConfig.branch;

    for (const url of treeApiUrls(repoInfo)) {
      try {
        const data = await fetchJson(url);
        const tree = Array.isArray(data.tree) ? data.tree : [];
        const files = tree
          .filter((item) => item.type === 'blob')
          .filter((item) => item.path && item.path.startsWith(`${folder}/`))
          .filter((item) => isImageFile(item.path))
          .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

        if (files.length) {
          return files.map((file) => {
            const name = file.path.split('/').pop();
            return {
              name,
              title: humanizeFilename(name),
              src: `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${branch}/${file.path.split('/').map(encodeURIComponent).join('/')}`
            };
          });
        }
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }

    return [];
  }

  async function fetchGalleryImages() {
    const repoInfo = inferGitHubRepo();
    if (!repoInfo) {
      document.body.dataset.galleryUnavailable = 'true';
      statusMessage('', '');
      return [];
    }

    const contentsImages = await fetchFromContentsApi(repoInfo);
    if (contentsImages && contentsImages.length) return contentsImages;

    const treeImages = await fetchFromTreeApi(repoInfo);
    if (treeImages.length) return treeImages;

    statusMessage(
      'warning',
      `No images were found in <code>${getFolder()}</code> for <code>${repoInfo.owner}/${repoInfo.repo}</code> on branch <code>${repoInfo.branch || defaultConfig.branch}</code>.`
    );
    return [];
  }

  function renderGallery(images) {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (!images.length) {
      if (document.body.dataset.galleryUnavailable === 'true') {
        statusMessage('', '');
        return;
      }
      if (!document.getElementById('gallery-status').classList.contains('warning')) {
        statusMessage('warning', 'No lab photos are available yet.');
      }
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
      statusMessage('error', `Unable to load lab photos. ${error.message}`);
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
