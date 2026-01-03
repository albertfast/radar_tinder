import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:radar_app/Providers/permit_test_provider.dart';
import 'package:radar_app/Shared/Controls/container_decoration.dart';
import 'package:radar_app/Shared/Controls/get_appBar.dart';
import 'package:radar_app/Shared/Controls/get_button.dart';
import 'package:radar_app/Shared/Controls/get_text.dart';
import 'package:radar_app/Shared/Extensions/extensions.dart';
import 'package:radar_app/Shared/Theme/themeColors.dart';

import '../../Shared/Controls/animated_loader.dart';
import '../../Shared/Resources/strings.dart';
class DisclaimerScreen extends StatefulWidget {
  const DisclaimerScreen({super.key});

  @override
  State<DisclaimerScreen> createState() => _DisclaimerScreenState();
}

class _DisclaimerScreenState extends State<DisclaimerScreen> {
  @override
  void initState() {
    super.initState();
    context.read<PermitTestProvider>().resetDisclaimerValue();
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: getAppBar(disclaimer,color: transparentColor),
      body: Column(
        children: [
          Container(
            width: double.infinity,
            height: context.width*0.15,
            decoration: BoxDecoration(
              color: primaryColor,
              borderRadius: BorderRadius.only(topLeft: Radius.circular(16), topRight: Radius.circular(16)),
            ),
            child: 
            Center(child: FittedBox(child: GetText(text: '${context.read<PermitTestProvider>().selectedState} $practiceTest',color: whiteColor,fontWeight: FontWeight.bold,fontSize: context.responsiveFontSize(20),)).paddingHorizontal(16)),
          ),
          Container(
            width: double.infinity,
            height: context.width*0.15,
            decoration: BoxDecoration(
              color: secondaryColor,
              borderRadius: BorderRadius.only(bottomLeft: Radius.circular(16), bottomRight: Radius.circular(16)),
            ),
            child:
            Center(child: GetText(text: questionsTailoredToYourState,)),
          ),
          16.pixelHeight,
          Container(
            width: double.infinity,
            decoration: BoxDecoration(
              color: secondaryColor,
              borderRadius: radiusValueTen,
            ),
            child:
            Column(crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                GetText(text: pleaseReadBeforeContinuing,color: whiteColor,fontWeight: FontWeight.bold,fontSize: context.responsiveFontSize(18),),
                16.pixelHeight,
                GetText(text: disclaimerDescription,color: whiteColor,)
              ],
            ).paddingAll(16),
          ),
          16.pixelHeight,
          Consumer<PermitTestProvider>(
            builder: (BuildContext context, provider, Widget? child) {
              return ListTile(
                onTap: () {
                  provider.isDisclaimerAgreedCheck();
                },
                tileColor: secondaryColor,
                shape: RoundedRectangleBorder(borderRadius: radiusValueTen),
                leading:!provider.isDisclaimerAgreed? Image.asset(checkboxIcon,height: context.width*0.06,):Image.asset(checkboxFillIcon,height: context.width*0.06,),
                title: GetText(text: iUnderstandAndAgree,color: whiteColor,),
              );
            },
          )
        ],
      ).paddingAll(16),
      bottomNavigationBar: Consumer<PermitTestProvider>(
        builder: (BuildContext context, provider, Widget? child) {
          return Opacity(opacity:provider.isDisclaimerAgreed?1: 0.5,
              child: GetButtonWithTrailingIcon(onTap:provider.isDisclaimerAgreed && !provider.isAPILoading? (){provider.initializeQuiz(context);}:(){}, text: startTest,color: primaryColor, icon: playIcon,trailingIcon: !provider.isAPILoading?null:AnimatedLoader(color: whiteColor,),).paddingAll(16));
        },
      ),
    );
  }
}
