import 'package:ai_ppt_generater/AdsUtils/firebase_event_service.dart';
import 'package:ai_ppt_generater/ads/ads_collapsible_banner.dart';
import 'package:ai_ppt_generater/ads/ads_variable.dart';
import 'package:ai_ppt_generater/controller/template_controller.dart';
import 'package:ai_ppt_generater/model/template_model.dart';
import 'package:ai_ppt_generater/screens/template_preview_screen.dart';
import 'package:ai_ppt_generater/service/app_constant.dart';
import 'package:ai_ppt_generater/widgets/custom_widgets.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_screenutil/flutter_screenutil.dart';
import 'package:get/get.dart';

import '../widgets/press_unpress_widget.dart';

class TemplateSelectScreen extends StatefulWidget {
  final String prompt, searchQuery;
  final List<TemplateModel> templates;

  const TemplateSelectScreen({super.key, required this.prompt, required this.searchQuery, required this.templates});

  @override
  State<TemplateSelectScreen> createState() => _TemplateSelectScreenState();
}

class _TemplateSelectScreenState extends State<TemplateSelectScreen> {
  late final TemplateController controller;

  @override
  void initState() {
    super.initState();
    FirebaseEventService.logEvent(eventName: 'select_template_screen');
    Get.delete<TemplateController>(force: true);
    controller = Get.put(TemplateController(templates: widget.templates));
  }

  @override
  void dispose() {
    Get.delete<TemplateController>(force: true);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, c) {
            return Container(
              height: c.maxHeight,
              width: c.maxWidth,
              color: appBackgroundColor,
              child: Obx(() {
                final selected = controller.selectedTemplate.value;
                return SafeArea(
                  child: Column(
                    children: [
                      SizedBox(
                        height: 200.w,
                        width: sw,
                        child: Row(
                          children: [
                            50.horizontalSpace,
                            PressUnpress(
                              onTap: () {
                                Get.back();
                              },
                              width: 100.w,
                              height: 100.w,
                              imageAssetPress: 'assets/setting_screen/back_press.png',
                              imageAssetUnPress: 'assets/setting_screen/back_unpress.png',
                            ),
                            Spacer(),
                            appText(title: "Templates", fs: 60.sp, family: fontFamilySemiBold, color: Colors.white),
                            Spacer(),
                            SizedBox(height: 100.w, width: 100.w),
                            50.horizontalSpace,
                          ],
                        ),
                      ),
                      Expanded(
                        child: GridView.builder(
                          padding: EdgeInsets.symmetric(horizontal: 50.w),
                          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, crossAxisSpacing: 30.w, mainAxisSpacing: 30.w, childAspectRatio: 1.74),
                          itemCount: controller.templates.length,
                          itemBuilder: (context, index) {
                            var template = controller.templates[index];
                            return GestureDetector(
                              onTap: () {
                                controller.select(template);
                              },
                              child: Container(
                                decoration: BoxDecoration(
                                  color: Color(0xff0C0C0C),
                                  border: selected?.id == template.id ? Border.all(color: appColor, width: 1.5) : null,
                                  borderRadius: BorderRadius.circular(50.w),
                                ),
                                alignment: Alignment.center,
                                child: ClipRRect(
                                  borderRadius: BorderRadius.circular(40.w),
                                  child: Image.network(
                                    template.media.first,
                                    fit: BoxFit.contain,
                                    loadingBuilder: (context, child, loadingProgress) {
                                      if (loadingProgress == null) return child;
                                      return Center(child: CupertinoActivityIndicator(color: appColor));
                                    },
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
                      Obx(() {
                        if (controller.selectedTemplate.value != null) {
                          return Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              50.verticalSpace,

                              PressUnpress(
                                onTap: () {
                                  onTapInter(() {
                                    showLog("Template : ${controller.selectedTemplate.value}");
                                    Get.to(() => TemplatePreviewScreen(prompt: widget.prompt, searchQuery: widget.searchQuery, template: controller.selectedTemplate.value!));
                                  });
                                },
                                pressColor: pressColor.withOpacity(0.5),
                                unPressColor: pressColor,
                                mRight: 50.w,
                                mLeft: 50.w,
                                child: appText(title: "Use Template", fs: 58.sp, family: fontFamilySemiBold, color: Colors.white),
                              ),
                              50.verticalSpace,
                              if (!AdsVariable.isPurchase.value) (AdsVariable.collapsibleBanner != "11" && AdsVariable.collapsibleBanner.isNotEmpty) ? CollapsibleBannerWidget(adUnitId: AdsVariable.collapsibleBanner, enable: AdsVariable.sendRevenueToAnalyticsForCollapsibleBanner) : SizedBox.shrink(),
                            ],
                          );
                        } else {
                          return SizedBox();
                        }
                      }),
                    ],
                  ),
                );
              }),
            );
          },
        ),
      ),
      /*bottomNavigationBar: Obx(() {
        if (controller.selectedTemplate.value != null) {
          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              50.verticalSpace,

              PressUnpress(
                onTap: () {
                  onTapInter(() {
                    Get.to(() => TemplatePreviewScreen(prompt: widget.prompt, searchQuery: widget.searchQuery, template: controller.selectedTemplate.value!));
                  });
                },
                width: 1100.w,
                height: 200.h,
                imageAssetPress: 'assets/select_template_screen/Use  template_press.png',
                imageAssetUnPress: 'assets/select_template_screen/Use template_unpress.png',
              ),
              50.verticalSpace,
              if (!AdsVariable.isPurchase.value) (AdsVariable.collapsibleBanner != "11" && AdsVariable.collapsibleBanner.isNotEmpty) ? CollapsibleBannerWidget(adUnitId: AdsVariable.collapsibleBanner, enable: AdsVariable.sendRevenueToAnalyticsForCollapsibleBanner) : SizedBox.shrink(),
            ],
          );
        } else {
          return SizedBox();
        }
      }),*/
    );
  }
}
