import * as puppeteer from 'puppeteer'; // eslint-disable-line
import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';
import * as mkdirp from 'mkdirp';
import * as touch from 'touch';

interface dataCache {
  [key: string]: {
    copyright?: string;
  };
}

const download = (
  url: string,
  name: string,
  ext: string,
  outDir: string,
  mediaDir: string
) => {
  return new Promise((resolve, reject) => {
    const dir = `${outDir}/${mediaDir}`;
    mkdirp(dir, (err) => {
      if (err) {
        reject(err);
        return;
      }
      const file = fs.createWriteStream(`${dir}/${name}${ext}`);

      console.log(url);
      https
        .get(url, (res) => {
          res.on('data', (d) => {
            file.write(d);
          });

          res.on('end', () => {
            resolve();
          });
        })
        .on('error', (e) => {
          console.error(e);
        });
    });
  });
};

const checkIfFileExists = (
  name: string,
  ext: string,
  outDir: string,
  mediaDir: string
) => {
  return new Promise((resolve, reject) => {
    fs.access(`${outDir}/${mediaDir}/${name}${ext}`, (err) => {
      resolve(!err);
    });
  });
};

export const createImportFile = (
  content: string,
  outDir?: string,
  basename?: string
) => {
  return new Promise((resolve, reject) => {
    const filePath = outDir || 'out';
    basename = basename ? `${basename}_` : '';
    fs.writeFile(
      `${filePath}/${basename}import.txt`,
      content,
      {flag: 'w+'},
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
};

export const createDataCacheFile = (content: string, outDir?: string) => {
  return new Promise((resolve, reject) => {
    const filePath = outDir || 'out';
    fs.writeFile(
      `${filePath}/data_cache.json`,
      content,
      {flag: 'w+'},
      (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      }
    );
  });
};

export const fetchResouces = async (
  page: puppeteer.Page,
  data: Array<string>,
  options: {
    output?: string;
    media?: string;
  } | null
): Promise<[string, dataCache]> => {
  options = options || {};
  const outDir = options.output
    ? path.resolve(process.cwd(), options.output)
    : 'out';

  const dataCacheFilePath = path.resolve(outDir, './data_cache.json');
  let dataCache: dataCache;

  try {
    dataCache = await new Promise<dataCache>((resolve, reject) => {
      touch(dataCacheFilePath, (err) => {
        if (err) {
          reject(err);
          return;
        }
        fs.readFile(dataCacheFilePath, 'utf8', (err, data) => {
          if (err) {
            reject(err);
          }
          let json;
          try {
            json = JSON.parse(data);
          } catch (err) {
            json = <dataCache>{};
          }
          resolve(json);
        });
      });
    });
  } catch (err) {
    console.log(err);
    return;
  }

  const [word, questionData, imageOptions, appendixOptions] = data;
  const [question] = questionData.split(/:/);

  let [imageSupplyer, imageId, imageName] = imageOptions
    ? imageOptions.split(/:/)
    : [null, null, null, null, null];

  const [appendix] = appendixOptions ? appendixOptions.split(/:/g) : [null];

  console.log(`---- ${word} ----`);
  const dictHost = 'https://ja.wikipedia.org';

  let thumbUrl: string;
  const imageFileName = /^(local|direct)$/.test(imageSupplyer) ? imageId : null;
  const imageExt = imageFileName
    ? path.extname(imageFileName).toLocaleLowerCase()
    : '.jpg';

  imageName =
    imageName ||
    (imageFileName ? path.basename(imageFileName, imageExt) : null) ||
    word;

  const mediaDir = options.media ? options.media : 'media';

  let imageCopyright = '';

  if (
    !dataCache[word] ||
    (imageSupplyer !== 'none' &&
      !(await checkIfFileExists(imageName, imageExt, outDir, mediaDir)))
  ) {
    dataCache[word] = dataCache[word] || {};

    try {
      const encodedWord = encodeURI(word);
      await page.goto(`${dictHost}/wiki/${encodedWord}`);

      let entryHandle;
      try {
        await page.waitForSelector('.infobox img', {
          timeout: 10000,
        });
        entryHandle = await page.$('.infobox img');
      } catch (err) {}

      if (entryHandle) {
        const copyright = `<a href="${page.url()}">Wikipedia</a>`;

        thumbUrl = await page.evaluate((entry: Element) => {
          if (!entry) {
            return;
          }
          return entry.getAttribute('src').replace(/[0-9]+px-/, '1000px-');
        }, entryHandle);

        if (thumbUrl && !imageSupplyer) {
          await download(
            `https:${thumbUrl}`,
            imageName,
            imageExt,
            outDir,
            mediaDir
          );
          imageCopyright = `Image from ${copyright}<br>`;
        }
      }
    } catch (error) {
      console.log(error);
    }

    try {
      if (imageSupplyer && imageSupplyer === 'unsplash') {
        const unsplashHost = 'https://unsplash.com';
        await page.goto(`${unsplashHost}/photos/${imageId}`);
        const imgHandles = await page.$$('[data-test="photos-route"] img');
        const imgHandle = imgHandles[1];

        if (imgHandle) {
          [thumbUrl] = await page.evaluate((img: Element) => {
            if (!img) {
              return;
            }
            const src = img.getAttribute('src');
            return [src];
          }, imgHandle);

          if (thumbUrl) {
            thumbUrl = thumbUrl.replace(/auto=format/, 'fm=jpg');
            const imageUrl = page.url();
            const copyright = `<a href="${unsplashHost}${imageUrl}">Unsplash</a>`;
            imageCopyright = `Image from ${copyright}<br>`;
            await download(
              `${thumbUrl}`,
              imageName,
              imageExt,
              outDir,
              mediaDir
            );
          }
        }
        imgHandles.forEach((imgHandle) => imgHandle.dispose());
      }

      if (imageSupplyer && imageSupplyer === 'direct') {
        try {
          await download(
            `https://${imageId}`,
            imageName,
            imageExt,
            outDir,
            mediaDir
          );
        } catch (err) {
          console.log(err);
        }
        if (/wikimedia|wikipedia/.test(imageId)) {
          imageCopyright = `Image from <a href="${imageId}">Wikipedia</a>`;
        } else {
          imageCopyright = '';
        }
      }
    } catch (err) {
      console.log(err);
    }
  }

  let content = `${word};${question};`;

  if (await checkIfFileExists(imageName, imageExt, outDir, mediaDir)) {
    content += `<img src="${imageName}${imageExt}" />;`;
  } else if (imageSupplyer && imageSupplyer === 'media') {
    // It assumes the image is already have in the collection.media directory
    content += `<img src="${imageId}${imageExt}" />;`;
  } else {
    content += ';';
  }

  if (imageCopyright) {
    const copyright = `${imageCopyright}`;
    dataCache[word].copyright = copyright;
    content += `${copyright};`;
  } else if (dataCache[word].copyright) {
    content += `${dataCache[word].copyright};`;
  } else {
    content += ';';
  }

  if (appendix) {
    content += appendix;
  }

  return [content, dataCache];
};
