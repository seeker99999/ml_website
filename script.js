(function () {
  const config = window.MORRISON_LAB_SITE_CONFIG || {};

  function inferGitHubRepo() {
    const host = window.location.hostname;
    const pathParts = window.location.pathname.split('/').filter(Boolean);

    if (config.githubOwner && config.githubRepo) {
      return {
        owner: config.githubOwner,
        repo: config.githubRepo,
        branch: config.branch || ''
      };
    }

    if (!host.endsWith('.github.io')) {
      return null;
    }

    const owner = host.replace('.github.io', '');
    const repo = pathParts.length > 0 ? pathParts[0] : `${owner}.github.io`;

    return {
      owner,
      repo,
      branch: config.branch || ''
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
    return /\.(jpe?g|png)$/i.test(name);
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

  function getApiUrl(repoInfo) {
    const folder = config.labPicsFolder || 'lab_pics';
    let url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${folder}`;
    if (repoInfo.branch) {
      url += `?ref=${encodeURIComponent(repoInfo.branch)}`;
    }
    return url;
  }

  async function fetchGalleryImages() {
    const repoInfo = inferGitHubRepo();
    if (!repoInfo) {
      document.body.dataset.galleryUnavailable = 'true';
      statusMessage('', '');
      return [];
    }

    const response = await fetch(getApiUrl(repoInfo), {
      headers: { Accept: 'application/vnd.github+json' }
    });

    if (response.status === 404) {
      statusMessage('warning', `No <code>${config.labPicsFolder || 'lab_pics'}</code> folder was found in this public repository. Create the folder and add JPEG or PNG files.`);
      return [];
    }

    if (!response.ok) {
      throw new Error(`GitHub API returned ${response.status}.`);
    }

    const files = await response.json();
    return files
      .filter((file) => file.type === 'file' && isImageFile(file.name))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map((file) => ({
        name: file.name,
        title: humanizeFilename(file.name),
        src: file.download_url || file.html_url
      }));
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

    statusMessage('success', `${images.length} image${images.length === 1 ? '' : 's'} loaded from <code>${config.labPicsFolder || 'lab_pics'}</code>.`);

    images.forEach((image) => {
      const button = document.createElement('button');
      button.className = 'gallery-item';
      button.type = 'button';
      button.setAttribute('aria-label', `Open ${image.title}`);
      button.innerHTML = `
        <img src="${image.src}" alt="${image.title}" loading="lazy">
        <span>${image.title}</span>
      `;
      button.addEventListener('click', () => openDialog(image));
      grid.appendChild(button);
    });
  }

  function openDialog(image) {
    const dialog = document.getElementById('image-dialog');
    const dialogImage = document.getElementById('dialog-image');
    const dialogCaption = document.getElementById('dialog-caption');
    if (!dialog || !dialogImage || !dialogCaption) return;

    dialogImage.src = image.src;
    dialogImage.alt = image.title;
    dialogCaption.textContent = image.title;

    if (typeof dialog.showModal === 'function') {
      dialog.showModal();
    } else {
      window.open(image.src, '_blank', 'noopener');
    }
  }

  function setupDialog() {
    const dialog = document.getElementById('image-dialog');
    const close = document.querySelector('.dialog-close');
    if (!dialog || !close) return;

    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      const rect = dialog.getBoundingClientRect();
      const clickedOutside = event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
      if (clickedOutside) dialog.close();
    });
  }

  async function loadGallery() {
    if (!document.body.matches('[data-page="lab-pics"]')) return;
    delete document.body.dataset.galleryUnavailable;
    statusMessage('', 'Loading lab photos…');
    try {
      const images = await fetchGalleryImages();
      renderGallery(images);
    } catch (error) {
      statusMessage('error', `Gallery could not load. ${error.message} Check <code>site-config.js</code> and confirm the GitHub repository is public.`);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupDialog();
    const refreshButton = document.getElementById('refresh-gallery');
    if (refreshButton) refreshButton.addEventListener('click', loadGallery);
    loadGallery();
  });
})();
