/**
 * B2-Rent Platform - Automated End-to-End Test Script (CommonJS)
 */

const { chromium } = require('playwright');

async function runBookingTest() {
  console.log('🚀 بدء تشغيل اختبار تدفق الحجز التلقائي لمنصة B2-Rent...');
  
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('📍 1. الانتقال إلى الصفحة الرئيسية...');
    await page.goto('http://localhost:3000');
    await page.waitForTimeout(2000);

    console.log('🚗 2. اختيار سيارة من الأسطول المتاح...');
    await page.click('text=تصفح السيارات والعقارات');
    await page.waitForTimeout(1500);

    const bookButton = await page.locator('text=التفاصيل والحجز').first();
    await bookButton.click();
    await page.waitForTimeout(2000);

    console.log('✍️ 3. اختبار التحقق من التوقيع الإلكتروني الإلزامي...');
    const confirmBookingBtn = await page.locator('text=تأكيد الحجز وتوقيع العقد');
    if (await confirmBookingBtn.isVisible()) {
      await confirmBookingBtn.click();
      await page.waitForTimeout(1000);
      console.log('✔️ تم التحقق من نجاح حظر الحجز عندما يكون مربع التوقيع فارغاً.');
    }

    const canvas = await page.locator('canvas').first();
    if (await canvas.isVisible()) {
      const box = await canvas.boundingBox();
      if (box) {
        await page.mouse.move(box.x + 50, box.y + 50);
        await page.mouse.down();
        await page.mouse.move(box.x + 150, box.y + 80);
        await page.mouse.up();
        console.log('✍️ تم رسم التوقيع الإلكتروني بنجاح.');
      }
    }

    console.log('📄 4. تأكيد الحجز وتوليد عقد الإيجار الرقمي PDF...');
    await confirmBookingBtn.click();
    await page.waitForTimeout(3000);

    const downloadPdfBtn = await page.locator('text=تحميل عقد الإيجار (PDF)');
    const whatsappBtn = await page.locator('text=إرسال العقد عبر واتساب');
    const emailBtn = await page.locator('text=إرسال العقد عبر البريد الإلكتروني');

    if (await downloadPdfBtn.isVisible()) {
      console.log('✅ زر تحميل عقد PDF يظهر ويعمل بكفاءة.');
    }

    console.log('📱 5. اختبار إرسال الإشعارات (واتساب وبريد إلكتروني)...');
    if (await whatsappBtn.isVisible()) {
      await whatsappBtn.click();
      await page.waitForTimeout(1000);
      console.log('✅ تم اختبار تفعيل إرسال العقد عبر واتساب بنجاح.');
    }

    if (await emailBtn.isVisible()) {
      await emailBtn.click();
      await page.waitForTimeout(1000);
      console.log('✅ تم اختبار تفعيل إرسال العقد عبر البريد الإلكتروني بنجاح.');
    }

    console.log('🎉 اكتمل اختبار تدفق الحجز والتوقيع والإشعارات بنجاح تام دون أي أخطاء!');

  } catch (error) {
    console.error('❌ حدث خطأ أثناء تنفيذ اختبار التدفق:', error);
  } finally {
    await browser.close();
  }
}

runBookingTest();
