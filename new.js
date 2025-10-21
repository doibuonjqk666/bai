/**
 * SCRIPT HOÀN THÀNH VIDEO COURSERA v5.3 (Enhanced Logic & Delay)
 * Tác giả: Dựa trên nghiên cứu của cộng đồng.
 * Ngày cập nhật: 21/10/2025
 *
 * TÍNH NĂNG:
 * - Sử dụng API onDemandVideoProgresses.v1 để cập nhật tiến độ video (chính).
 * - Gửi thêm yêu cầu 'ended' qua API opencourse.v1 để tăng tính tương thích (phụ).
 * - Tăng độ trễ giữa các lệnh gọi API lên 2 giây để đảm bảo server đồng bộ.
 * - Logic tìm kiếm thông minh hơn: luôn ưu tiên lấy thời lượng video chính xác nhất.
 * - Tự động tìm videoId bằng 2 phương pháp (chính và dự phòng).
 * - Tự động lấy tất cả thông tin cần thiết (userId, courseId, lectureId).
 * - Cung cấp log chi tiết trên Console để dễ dàng theo dõi.
 *
 * CÁCH CHẠY:
 * 1. Mở trang bài giảng video trên Coursera.
 * 2. Mở Developer Tools (F12 hoặc Ctrl+Shift+I).
 * 3. Chuyển sang tab "Console".
 * 4. Dán toàn bộ script này vào và nhấn Enter.
 * 5. Gõ lệnh sau và nhấn Enter:
 * await markCurrentVideoAsComplete()
 */

// ===================== HELPER FUNCTIONS =====================

function getUserId() {
    // 1. Ưu tiên từ script tag
    const scriptTag = document.querySelector('body > script:nth-child(3)');
    if (scriptTag && scriptTag.textContent) {
        const match = scriptTag.textContent.match(/(\d+~[A-Za-z0-9-_]+)/);
        if (match && match[1]) return match[1].split('~')[0];
    }

    // 2. Từ header link
    const headerLink = document.querySelector('[data-testid="page-header-wrapper"] a[data-track-app="open_course_home"]');
    if (headerLink) {
        const clickValue = headerLink.getAttribute('data-click-value');
        if (clickValue) {
            try {
                const parsed = JSON.parse(clickValue);
                if (parsed.userId) return parsed.userId.toString();
            } catch (e) { /* Bỏ qua lỗi parsing */ }
        }
    }

    // 3. Fallback: nhập tay
    const manual = prompt("Không tự động lấy được User ID.\n\nNhập thủ công (chỉ số, ví dụ: 182559818):");
    if (manual && /^\d+$/.test(manual.trim())) {
        return manual.trim();
    }

    throw new Error("Không thể lấy được User ID. Script dừng lại.");
}

function getCourseContextFromUrl() {
    const match = window.location.pathname.match(/\/learn\/([^/]+)\/lecture\/([^/]+)/);
    if (!match) throw new Error("URL không hợp lệ. Hãy chắc chắn bạn đang ở trên một trang bài giảng (lecture).");
    return { courseSlug: match[1], lectureId: match[2] };
}

async function getCourseId(slug) {
    const url = `https://www.coursera.org/api/onDemandCourses.v1?q=slug&slug=${slug}&fields=id`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`Lỗi khi lấy courseId: ${res.status}`);
    const data = await res.json();
    const course = data.elements?.[0];
    if (!course?.id) throw new Error("Không tìm thấy ID khóa học từ API.");
    return course.id;
}

// ===================== VIDEO INFO FINDER (ENHANCED) =====================

async function getVideoInfo(courseSlug, lectureId, courseId) {
    // Bước 1: Luôn truy vấn API Course Materials vì nó chứa nhiều metadata nhất (như duration).
    console.log("-> Lấy thông tin chi tiết bài giảng từ Course Materials API...");
    const materialsUrl = `https://www.coursera.org/api/onDemandCourseMaterials.v2/?q=slug&slug=${courseSlug}&includes=items&fields=onDemandCourseMaterialItems.v2(name,slug,contentSummary,assetSummary)`;
    const materialsRes = await fetch(materialsUrl, { credentials: 'include' });
    if (!materialsRes.ok) throw new Error(`Lỗi API Materials: ${materialsRes.status}`);
    
    const materialsData = await materialsRes.json();
    const items = materialsData?.linked?.['onDemandCourseMaterialItems.v2'];
    if (!items) throw new Error("Không có dữ liệu bài học trong API Materials.");
    
    const item = items.find(i => i.id === lectureId);
    if (!item) throw new Error(`Không tìm thấy item '${lectureId}' trong API Materials.`);

    // Bước 2: Lấy ra thời lượng chính xác nhất có thể. Nếu không có, dùng giá trị mặc định.
    const duration = item?.assetSummary?.definition?.duration || 300000;
    console.log(`   Tìm thấy thời lượng: ${duration}ms`);

    // Bước 3: Thử lấy videoId từ nguồn chính (cách 1).
    let videoId = item?.assetSummary?.definition?.videoId;
    if (videoId) {
        console.log("   Thành công lấy videoId bằng cách 1!");
        return { videoId, duration };
    }

    // Bước 4: Nếu cách 1 thất bại, dùng cách 2 (dự phòng) để lấy videoId, nhưng vẫn giữ lại duration đã tìm được.
    console.warn("   Không tìm thấy videoId trong Course Materials. Thử cách 2 (Fallback)...");
    try {
        const lectureUrl = `https://www.coursera.org/api/onDemandLectureVideos.v1/${courseId}~${lectureId}?includes=video&fields=onDemandVideos.v1(id)`;
        const lectureRes = await fetch(lectureUrl, { credentials: 'include' });
        if (!lectureRes.ok) throw new Error(`Lỗi API Lecture: ${lectureRes.status}`);
        
        const lectureData = await lectureRes.json();
        videoId = lectureData?.linked?.['onDemandVideos.v1']?.[0]?.id;

        if (!videoId) {
            throw new Error("Không tìm thấy videoId trong API Lecture.");
        }
        
        console.log("   Thành công lấy videoId bằng cách 2!");
        return { videoId, duration }; // Trả về videoId từ cách 2 và duration từ cách 1.
    } catch (fallbackError) {
         console.error(`   Cách 2 cũng thất bại: ${fallbackError.message}`);
         throw new Error("Không thể tìm thấy videoId bằng cả hai cách. Đây có thể là bài đọc thuần túy hoặc quiz.");
    }
}


// ===================== CORE ACTIONS =====================

/**
 * [Hành động chính] Gửi yêu cầu PUT để cập nhật tiến độ video.
 */
async function completeVideo(userId, courseId, videoId, duration) {
    const videoProgressId = `${userId}~${courseId}~${videoId}`;
    const url = `https://www.coursera.org/api/onDemandVideoProgresses.v1/${videoProgressId}`;

    const csrfCookie = document.cookie.match(/CSRF3-Token=([^;]+)/) || document.cookie.match(/csrftoken=([^;]+)/);
    const csrfToken = csrfCookie ? csrfCookie[1] : '';
    if (!csrfToken) throw new Error("Không tìm thấy CSRF token. Bạn đã đăng nhập chưa?");

    const headers = {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        'x-coursera-application': 'ondemand'
    };
    if (document.cookie.includes('CSRF3-Token=')) {
        headers['x-csrf3-token'] = csrfToken;
    } else {
        headers['x-csrftoken'] = csrfToken;
    }

    const res = await fetch(url, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify({
            viewedUpTo: duration,
            videoProgressId: videoProgressId
        }),
        credentials: 'include'
    });
    
    if (res.status === 204 || res.ok) {
        return true;
    } else {
        console.error("Phản hồi lỗi từ server (PUT request):", res);
        const errorBody = await res.text();
        console.error("Nội dung lỗi:", errorBody);
        return false;
    }
}

/**
 * [Hành động phụ] Gửi yêu cầu POST để đánh dấu sự kiện 'ended'.
 */
async function markLectureAsEnded(userId, courseSlug, lectureId) {
    const apiUrl = `https://www.coursera.org/api/opencourse.v1/user/${userId}/course/${courseSlug}/item/${lectureId}/lecture/videoEvents/ended?autoEnroll=false`;
    
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'x-coursera-application': 'ondemand',
                'x-requested-with': 'XMLHttpRequest'
            },
            body: JSON.stringify({ contentRequestBody: {} }),
            credentials: "include"
        });

        if (response.ok) {
            console.log("   -> Yêu cầu bổ sung 'ended' thành công.");
        } else {
            const errorData = await response.json();
            console.warn(`   -> Yêu cầu bổ sung 'ended' không thành công (Status: ${response.status}).`);
            console.warn(`      Lý do: ${errorData.message}`);
        }
    } catch (error) {
        console.warn(`   -> Lỗi khi gửi yêu cầu 'ended': ${error.message}`);
    }
}


// ===================== MAIN FUNCTION =====================
async function markCurrentVideoAsComplete() {
    try {
        console.clear();
        console.log("%c🚀 BẮT ĐẦU SCRIPT HOÀN THÀNH VIDEO v5.3 🚀", "color: #8A2BE2; font-weight: bold; font-size: 16px");

        // 1. Lấy thông tin cơ bản
        const userId = getUserId();
        const { courseSlug, lectureId } = getCourseContextFromUrl();
        console.log(`- User ID: ${userId}`);
        console.log(`- Khóa học Slug: ${courseSlug}`);
        console.log(`- Bài giảng ID: ${lectureId}`);

        // 2. Lấy Course ID nội bộ
        console.log("Đang lấy Course ID...");
        const courseId = await getCourseId(courseSlug);
        console.log(`- Course ID: ${courseId}`);

        // 3. Lấy Video ID và Duration bằng phương pháp tổng hợp
        console.log("Đang lấy thông tin video...");
        const { videoId, duration } = await getVideoInfo(courseSlug, lectureId, courseId);
        console.log(`- Video ID: ${videoId}`);
        console.log(`- Thời lượng (ms): ${duration}`);

        // 4. Gửi yêu cầu hoàn thành chính (PUT)
        console.log("Đang gửi yêu cầu hoàn thành chính (PUT)...");
        const success = await completeVideo(userId, courseId, videoId, duration);

        if (success) {
            // 5. Đợi một chút để server đồng bộ
            console.log("Đợi 2 giây để server đồng bộ tiến độ...");
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 6. Gửi yêu cầu hoàn thành phụ (POST)
            console.log("Đang gửi yêu cầu hoàn thành bổ sung (POST)...");
            await markLectureAsEnded(userId, courseSlug, lectureId);

            console.log("%c✅ THÀNH CÔNG! Video đã được đánh dấu là hoàn thành.", "color: #00d26a; font-weight: bold; font-size: 18px");
            console.log("   -> Vui lòng TẢI LẠI TRANG (F5) để thấy dấu tích xanh.");
        } else {
            throw new Error("Gửi yêu cầu hoàn thành chính (PUT) thất bại. Kiểm tra log lỗi ở trên.");
        }

    } catch (error) {
        console.error("%c❌ ĐÃ XẢY RA LỖI:", "color: red; font-weight: bold; font-size: 16px", error.message);
        console.log("   -> Gợi ý: Kiểm tra lại bạn đã đăng nhập, đang ở đúng trang video, và không có tiện ích nào chặn cookie/request.");
    }
}

// Hướng dẫn sử dụng
console.log(`
SCRIPT ĐÃ SẴN SÀNG! (v5.3 - Enhanced Logic & Delay)
1. Đảm bảo bạn đang ở đúng trang bài giảng có video.
2. Gõ lệnh sau vào console và nhấn Enter:
`);
console.log("%c   await markCurrentVideoAsComplete()", "background: #e3f2fd; color: #1976d2; padding: 4px 8px; border-radius: 4px; font-family: monospace;");

