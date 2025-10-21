/**
 * SCRIPT ĐÁNH DẤU BÀI GIẢNG HIỆN TẠI LÀ ĐÃ HOÀN THÀNH v2.1 (Sử dụng API để tăng độ chính xác)
 * Tự động lấy thông tin từ trang và API để gửi yêu cầu.
 * Cách chạy: await markCurrentLectureAsComplete()
 */

// ===================== HELPER FUNCTIONS =====================

/**
 * Lấy User ID từ các nguồn khác nhau trên trang.
 * @returns {string|null} User ID hoặc null nếu không tìm thấy.
 */
function getUserId() {
    try {
        // Thử lấy từ script tag chứa thông tin người dùng
        const scriptTag = document.querySelector('body > script:nth-child(3)');
        if (scriptTag && scriptTag.textContent) {
            const match = scriptTag.textContent.match(/(\d+~[A-Za-z0-9-_]+)/);
            if (match && match[1]) {
                const userId = match[1].split('~')[0]; // Sửa lỗi cú pháp: match.[1]split thành match[1].split
                if (userId) return userId;
            }
        }
        // Thử lấy từ link header
        const headerLink = document.querySelector('[data-testid="page-header-wrapper"] a[data-track-app="open_course_home"]');
        if (headerLink) {
            const clickValue = headerLink.getAttribute('data-click-value');
            if (clickValue) {
                const parsedValue = JSON.parse(clickValue);
                if (parsedValue.userId) return parsedValue.userId;
            }
        }
        console.error("Không thể tự động tìm thấy User ID.");
        return null;
    } catch (error) {
        console.error("Lỗi khi lấy User ID:", error);
        return null;
    }
}

/**
 * Phân tích URL hiện tại để lấy bối cảnh (tên khóa học và ID bài giảng).
 * @returns {Object} Đối tượng chứa courseName và lectureId.
 */
function getCourseContextFromUrl() {
    const pathParts = window.location.pathname.split('/');
    const learnIndex = pathParts.indexOf('learn');
    const lectureIndex = pathParts.indexOf('lecture');

    // Sửa lỗi cú pháp: thay | thành || và cải thiện logic điều kiện
    if (learnIndex === -1 || lectureIndex === -1 || lectureIndex < learnIndex) {
        throw new Error("URL không hợp lệ. Vui lòng chạy script này trên một trang bài giảng (lecture).");
    }

    const courseName = pathParts[learnIndex + 1];
    const lectureId = pathParts[lectureIndex + 1];

    if (!courseName || !lectureId) {
        throw new Error("Không thể trích xuất đầy đủ thông tin khóa học/bài giảng từ URL.");
    }

    return { courseName, lectureId };
}

/**
 * Gọi API để lấy tất cả các mục (items) của một khóa học.
 * @param {string} courseSlug - Slug của khóa học (ví dụ: 'javascript').
 * @returns {Promise<Array>} - Một mảng chứa các đối tượng item.
 */
async function getCourseItemsFromApi(courseSlug) {
    const apiUrl = `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${courseSlug}&includes=items&fields=onDemandCourseMaterialItems.v2(name,slug)`;
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`Lỗi khi gọi API lấy dữ liệu khóa học. Status: ${response.status}`);
        }
        const data = await response.json();
        // Sửa lỗi cú pháp: data?.linked?. thành data?.linked?.['onDemandCourseMaterialItems.v2']
        const items = data?.linked?.['onDemandCourseMaterialItems.v2'];
        // Sửa lỗi cú pháp: thay | thành || và cải thiện kiểm tra
        if (!items || items.length === 0) {
            throw new Error("Không tìm thấy dữ liệu bài học nào từ API.");
        }
        return items;
    } catch (error) {
        throw new Error(`Lỗi khi lấy dữ liệu khóa học: ${error.message}`);
    }
}

// ===================== MAIN FUNCTION =====================

/**
 * Tự động lấy thông tin và gửi yêu cầu để đánh dấu bài giảng hiện tại là đã hoàn thành.
 */
async function markCurrentLectureAsComplete() {
    try {
        console.log("🚀 Bắt đầu quá trình...");

        // 1. Lấy thông tin cơ bản
        console.log("- Đang lấy User ID và thông tin từ URL...");
        const userId = getUserId();
        const { courseName, lectureId } = getCourseContextFromUrl();

        if (!userId) {
            throw new Error("Không thể tiếp tục vì không lấy được User ID.");
        }

        // 2. Gọi API để lấy dữ liệu toàn bộ khóa học
        console.log(`- Đang gọi API để lấy dữ liệu cho khóa học '${courseName}'...`);
        const allItems = await getCourseItemsFromApi(courseName);

        // 3. Tìm đúng bài giảng hiện tại trong dữ liệu API để lấy slug chính xác
        const currentLectureItem = allItems.find(item => item.id === lectureId);

        if (!currentLectureItem) {
            throw new Error(`Không tìm thấy bài giảng với ID '${lectureId}' trong dữ liệu API.`);
        }
        const lectureSlug = currentLectureItem.slug; // Lấy slug chính xác từ API

        console.log("✅ Lấy thông tin thành công:");
        console.log(`   - User ID: ${userId}`);
        console.log(`   - Course Name: ${courseName}`);
        console.log(`   - Lecture ID: ${lectureId}`);
        console.log(`   - Lecture Slug (từ API): ${lectureSlug}`);

        // 4. Xây dựng và gửi yêu cầu fetch
        const apiUrl = `https://www.coursera.org/api/opencourse.v1/user/${userId}/course/${courseName}/item/${lectureId}/lecture/videoEvents/ended?autoEnroll=false`;
        
        console.log(`- Đang gửi yêu cầu POST đến: ${apiUrl}`);

        const response = await fetch(apiUrl, {
            headers: {
                "accept": "*/*",
                "accept-language": "en-US,en;q=0.9,vi;q=0.8",
                "content-type": "application/json; charset=UTF-8",
                "x-coursera-application": "ondemand",
                "x-requested-with": "XMLHttpRequest",
                "sec-ch-ua": "\"Not/A)Brand\";v=\"8\", \"Chromium\";v=\"126\", \"Google Chrome\";v=\"126\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"Windows\"",
                "sec-fetch-dest": "empty",
                "sec-fetch-mode": "cors",
                "sec-fetch-site": "same-origin"
            },
            referrer: `https://www.coursera.org/learn/${courseName}/lecture/${lectureId}/${lectureSlug}`,
            body: JSON.stringify({ contentRequestBody: {} }),
            method: "POST",
            mode: "cors",
            credentials: "include"
        });

        // 5. Xử lý và thông báo kết quả
        if (response.ok) {
            console.log(`🎉 THÀNH CÔNG! Phản hồi từ máy chủ: ${response.status} ${response.statusText}`);
            console.log("Bài giảng này đã được đánh dấu là hoàn thành. Hãy tải lại trang để kiểm tra.");
        } else {
            console.error(`❌ THẤT BẠI! Máy chủ phản hồi lỗi: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            // Sửa lỗi cú pháp: thay | thành || và cải thiện thông báo lỗi
            console.error("Chi tiết lỗi:", errorText || "(Không có chi tiết)");
        }

    } catch (error) {
        console.error("❌ Đã xảy ra lỗi nghiêm trọng trong quá trình thực thi:", error.message);
    }
}

// Hướng dẫn sử dụng
console.log(`
SCRIPT ĐÃ SẴN SÀNG! (v2.1 - Sử dụng API)
1. Đảm bảo bạn đang ở đúng trang bài giảng cần hoàn thành.
2. Gõ lệnh sau vào console và nhấn Enter:
   await markCurrentLectureAsComplete()
`);
