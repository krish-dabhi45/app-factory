import 'package:ai_ppt_generater/service/shimmer_layout.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';

class BannerShimmerWidget extends StatelessWidget {
  const BannerShimmerWidget({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: Get.width,
      height: 60.0,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(5.w),
        color: Colors.blueAccent.withOpacity(0.7),
        border: Border.all(color: Colors.grey),
      ),
      child: Shimmer.fromColors(
        baseColor: Colors.grey.shade300,
        highlightColor: Colors.grey,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(margin: EdgeInsets.all(5.w), width: 40.w, height: 40.w, color: Colors.grey.shade300),
            Column(
              mainAxisAlignment: MainAxisAlignment.start,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  margin: EdgeInsets.only(top: 10.w, bottom: 5.w, left: 5.w),
                  width: Get.width * 0.8,
                  height: 10.w,
                  color: Colors.grey.shade300,
                ),
                Container(margin: EdgeInsets.all(5.w), width: Get.width * 0.5, height: 10.w, color: Colors.grey.shade300),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
