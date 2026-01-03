import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:radar_app/Shared/Controls/container_decoration.dart';
import 'package:radar_app/Shared/Controls/get_appBar.dart';
import 'package:radar_app/Shared/Controls/get_text.dart';
import 'package:radar_app/Shared/Extensions/extensions.dart';
import 'package:radar_app/Shared/Resources/strings.dart';
import 'package:radar_app/Shared/Theme/themeColors.dart';
import '../../Providers/permit_test_provider.dart';
import '../../Shared/Controls/get_button.dart';

class PermitTestScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Consumer<PermitTestProvider>(
      builder: (context, provider, child) {
        return Scaffold(
          appBar: getAppBar('${provider.selectedState} $practiceTest', color: transparentColor,centerTitle: true),
          body: Column(
            children: [
              GetText(text: '$question ${provider.currentIndex}/20', fontSize: context.responsiveFontSize(20), fontWeight: FontWeight.w600, color: whiteColor),
              16.pixelHeight,
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  20,
                  (index) => Container(
                    margin: EdgeInsets.all(3),
                    width: context.width * 0.02,
                    height: context.width * 0.02,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: index == provider.currentIndex - 1 ? Colors.blue : provider.questionStatusColors[index],
                    ),
                  ),
                ),
              ),
              16.pixelHeight,
              Container(
                width: double.infinity,
                decoration: BoxDecoration(color: secondaryColor, borderRadius: radiusValueTen),
                child: GetText(
                  text: provider.currentQuestion,
                  fontSize: context.responsiveFontSize(18),
                  fontWeight: FontWeight.bold,
                  textAlign: TextAlign.center,
                ).paddingAll(12),
              ),
              16.pixelHeight,
              ...provider.currentOptions.map(
                (option) =>
            ListTile(
              onTap: () {
                provider.selectAnswer(option);
              },
              tileColor: secondaryColor,
              shape: RoundedRectangleBorder(borderRadius: radiusValueTen,side: BorderSide(color: provider.selectedAnswer == option ? primaryColor : Colors.transparent)),
              leading:provider.selectedAnswer!=option? Image.asset(checkboxIcon,height: context.width*0.06,):Image.asset(checkboxFillIcon,height: context.width*0.06,color: primaryColor,),
              title: GetText(text: option,color: whiteColor,),
            ).paddingBottom(16),
                
              ),
              16.pixelHeight,
              provider.isLastQuestion
                  ? Opacity(
                opacity:provider.selectedAnswer != null?1: 0.5,
                    child: GetButton(
                      onTap: provider.selectedAnswer != null?() {
                        provider.submitQuiz(context);
                      }:(){},
                      text: submit,
                      color: primaryColor,
                    ),
                  )
                  : Opacity(
                opacity:provider.selectedAnswer != null?1: 0.5,
                    child: GetButtonWithTrailingIcon(
                      onTap:
                          provider.selectedAnswer != null
                              ? () {
                                provider.nextQuestion();
                                if (provider.questionStatusColors[provider.currentIndex - 1] == Colors.grey) {
                                  provider.questionStatusColors[provider.currentIndex - 1] =
                                      provider.selectedAnswer == provider.correctAnswer ? Colors.green : Colors.red;
                                }
                              }
                              : () {},
                      text: nextQuestion,
                      icon: arrowForwardIcon,
                      color: primaryColor,
                    ),
                  ),
            ],
          ).paddingAll(16),
        );
      },
    );
  }
}
