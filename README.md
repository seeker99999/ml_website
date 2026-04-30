Morrison Lab website for GitHub Pages.

Files are all kept in one directory, with only one subfolder:
- lab_pics/

How the lab photo gallery works:
1. Upload this whole directory to a public GitHub Pages repository.
2. Add .jpg, .jpeg, or .png files to the lab_pics folder.
3. The Lab Pics page reads the public repository through the GitHub API and displays all supported images automatically.

Notes:
- If the site is hosted at https://USERNAME.github.io/REPOSITORY/, no config changes are usually needed.
- If you use a custom domain, edit site-config.js and set githubOwner and githubRepo.

Browser icon files included:
- favicon.png
- favicon.ico
- apple-touch-icon.png
