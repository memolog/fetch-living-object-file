#!/usr/bin/env node

'use strict;';

import * as program from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as puppeteer from 'puppeteer';

import {fetchResouces, createImportFile, createDataCacheFile} from './index';

const main = (args: any) => {
  program
    .version('1.0.0')
    .option('-i, --input <file')
    .option('-o, --output <file>')
    .option('--media <string>', 'media directory to save images and sounds')
    .parse(args);

  (async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    const contents: string[] = [];
    const ipaCache: {[key: string]: string} = {};
    const filePath = program.input
      ? path.resolve(process.cwd(), program.input)
      : './default_data.csv';
    const outDir = program.output
      ? path.resolve(process.cwd(), program.output)
      : null;
    const stream = fs.createReadStream(filePath, 'utf8');
    stream.on('data', async (datas: string) => {
      const data = datas.split(/\n/);
      for (const d of data) {
        const dataArray = d.split(/,/);
        if (dataArray.length < 2) {
          continue;
        }
        try {
          const [content, newIpaCache] = await fetchResouces(
            page,
            dataArray,
            program.opts()
          );
          contents.push(content);
          Object.assign(ipaCache, newIpaCache);
        } catch (err) {
          console.log(err);
          process.exit(1);
          return;
        }
      }
      await createImportFile(
        contents.join('\n'),
        outDir,
        path.basename(filePath, '.csv')
      );
      await createDataCacheFile(JSON.stringify(ipaCache), outDir);
      await browser.close();

      process.exit(0);
    });
  })();
};

if (require.main === module) {
  main(process.argv);
}

module.exports = main;
