import cheerio from "cheerio";
import { NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { Cluster } from "puppeteer-cluster";
import UserAgent from "user-agents";
// @ts-nocheck

let currentPage = 1;
const totalPages = 2;

export async function GET() {
  console.log("Starting script");
  const browser = await puppeteer.launch({   args: ['--no-sandbox'],
});
  console.log("Launching browser");
  const page = await browser.newPage();
  console.log("Opening page");
  await page.setUserAgent(new UserAgent().toString());
  console.log("Setting user agent");
  let allCars: any[] = [];

  const startTime = new Date().getTime();
  while (currentPage <= totalPages) {
    const startTime = new Date().getTime();

    const url = `https://en.m.autoplius.lt/ads?vip=1&order_by=3&page_nr=${currentPage}`;
    console.log(`Starting loop #${currentPage}`);

    const [previewList] = await getPreviewData(page, url);
    await hydrateDetailPage(previewList);
    allCars = allCars.concat(previewList);
    console.log("currPage", currentPage);
    currentPage++;
    const endTime = new Date().getTime();
    const elapsedTime = endTime - startTime;
    console.log(`First page took ${elapsedTime / 1000} seconds to complete.`);
  }
  const endTime = new Date().getTime();
  const elapsedTime = endTime - startTime;
  console.log("Last Car", allCars[allCars.length - 1]);
  console.log("Total Length", allCars.length);
  console.log(`The while loop took ${elapsedTime / 1000} seconds to complete.`);
  await browser.close();

  return NextResponse.json({ message: allCars }, { status: 200 });

}

 async function hydrateDetailPage(previewList:any) {
  console.log("Starting to hydrate detail pages");

  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: 5,
  });

  await cluster.task(async ({ page, data }) => {
    try {
      const userAgent = new UserAgent();
      await page.setUserAgent(userAgent.toString());
      await page.goto(data.detailUrl, { timeout: 0 });
      const htmlContent = await page.content();
      const $ = cheerio.load(htmlContent);

      const title = $(".title").text();
      const subtitle = $(".subtitle").text();
      const previewImg = $("#photoPanel").find("img").attr("src");
      const infoList: any[] = [];

      $(".modify-list .view-field").each((index, element) => {
        const title = $(element).find(".view-field-title").text();
        const value = $(element).text().replace(title, "").trim();
        infoList.push({ title: title.trim(), value });
      });

      const features: any[] = [];
      $(".features-container fieldset").each((index, element) => {
        const clusterName = $(element).find("legend").text();
        const clusterValues:any[] = [];
        $(element)
          .find(".feature-item")
          .each((index, element) => {
            clusterValues.push($(element).text().trim());
          });
        features.push({ clusterName, clusterValues });
      });

      // TODO: fetch all images in detail
      const carDetail = { title, subtitle, previewImg, infoList, features };
      data[carDetail as any] = carDetail;
      console.log(`Currently hydrating: ${title}`);
    } catch (error) {
      const err  = error as any
      console.error(`Error scraping ${data.title}: ${err?.message }`);
    } finally {
      await page.close();
    }
  });

  previewList.forEach((item: any) => {
    cluster.queue(item);
  });

  await cluster.idle();
  await cluster.close();
}

 async function getPreviewData(page: any, url: any) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  console.log("inside getPreviewData");

  const htmlContent = await page.content();
  const $ = cheerio.load(htmlContent);

  const carsListRaw = $(".js-announcement-list-item");
  const carsListPretty: any[] = [];
  const detailUrls: any[] = [];

  // carsListRaw.each(async (index, element) => {
  carsListRaw.each( (index, element) => {
    const car = $(element);
    const thumbnailSrc = car.find(".thumb-inner img").attr("src");
    const thumbnailDataSrc = car.find(".thumb-inner img").attr("data-src");
    const model = car.find(".title-list").text().trim();
    const subtitle = car.find(".subtitle-list").text().trim();
    const thumbnail = thumbnailSrc?.trim()?.length
      ? thumbnailSrc
      : thumbnailDataSrc;
    const price = car.find(".price-list strong").text().trim();
    let thumbParams;

    $(".param-list-row-block").each((index, element) => {
      const spans = $(element).find("span");
      let formattedText = "";
      spans.each((spanIndex, spanElement) => {
        formattedText += $(spanElement).text();
        if (spanIndex < spans.length - 1) {
          formattedText += " | ";
        }
      });
      thumbParams = formattedText;
    });

    const detailPageUrl = car.attr("href");
    const carData = {
      thumbnail,
      model,
      subtitle,
      price,
      thumbParams,
      detailUrl: detailPageUrl,
    };
    detailUrls.push(detailPageUrl);
    carsListPretty.push(carData);
  });

  console.log(`Scraped total ${carsListPretty.length}`);
  return [carsListPretty, detailUrls];
}
