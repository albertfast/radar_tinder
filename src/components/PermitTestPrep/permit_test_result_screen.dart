import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:radar_app/Shared/Controls/container_decoration.dart';
import 'package:radar_app/Shared/Controls/get_appBar.dart';
import 'package:radar_app/Shared/Controls/get_text.dart';
import 'package:radar_app/Shared/Extensions/extensions.dart';
import 'package:radar_app/Shared/Theme/themeColors.dart';
import '../../Providers/ads_provider.dart';
import '../../Providers/permit_test_provider.dart';
import '../../Shared/Controls/get_button.dart';
import '../../Shared/Resources/strings.dart';

class PermitTestResultScreen extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Consumer<PermitTestProvider>(
      builder: (context, provider, child) {
        final correctCount = provider.questionStatusColors.where((color) => color == Colors.green).length;
        final totalQuestions = provider.totalQuestions;

        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (bool didPop, Object? result) async {
            if (didPop) return;
            provider.resetPermitTest(context);
          },
          child: Scaffold(
            appBar: getAppBar(testComplete, color: transparentColor,centerTitle: true),
            body: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
               Container(
                 width: double.infinity,
                 decoration: BoxDecoration(
                  color: secondaryColor,
                  borderRadius: radiusValueTen,
               ),
                 child: Column(
                   children: [

                     GetText(
                       text: '$correctCount/$totalQuestions',
                       fontSize: context.responsiveFontSize(45),
                       fontWeight: FontWeight.bold,
                       color: whiteColor,
                     ),
                     10.pixelHeight,
                     GetText(
                       text: correctAnswers,
                       fontSize: context.responsiveFontSize(16),
                       color: greyColor,
                     ),
                   ],
                 ).paddingVertical(16),
               ),
                16.pixelHeight,
                GetText(
                  text: reviewYourResponsesBelow,
                  fontSize: context.responsiveFontSize(16),
                  color: greyColor,
                ),
                16.pixelHeight,
                Expanded(
                  child: ListView.builder(
                    itemCount: provider.questions.length,
                    itemBuilder: (context, index) {
                      final question = provider.questions[index];
                      final userAnswer = provider.userAnswers[index];
                      final isCorrect = provider.questionStatusColors[index] == Colors.green;
                      return Container(
                        margin: EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: secondaryColor,
                          borderRadius: radiusValueTen,
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                GetText(
                                  text: '#${index + 1}',
                                  fontSize: context.responsiveFontSize(16),
                                  color: whiteColor,
                                ),
                                10.pixelWidth,
                                Container(
                                  decoration: BoxDecoration(
                                    color: isCorrect ? Colors.green : Colors.red,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: GetText(text: isCorrect ? correct : inCorrect,
                                    color: whiteColor,).paddingHorizontal(8),
                                )
                              ],
                            ),
                            10.pixelHeight,
                            GetText(
                              text: question['question'],
                              fontSize: context.responsiveFontSize(16),
                              color: whiteColor,
                              fontWeight: FontWeight.bold,
                            ),
                            10.pixelHeight,

                            GetText(
                              text: '$yourAnswer:',
                              fontSize: context.responsiveFontSize(14),
                              color: greyColor,
                            ),
                            10.pixelHeight,
                            GetText(
                              text: userAnswer??'N/A',
                              fontSize: context.responsiveFontSize(14),
                              color: isCorrect ? Colors.green : Colors.red,
                            ),
                            if(!isCorrect)...[
                              10.pixelHeight,
                              GetText(
                                text: '$correctAnswer:',
                                fontSize: context.responsiveFontSize(14),
                                color: greyColor,
                              ),
                              10.pixelHeight,
                              GetText(
                                text: question['correct_answer']??'N/A',
                                fontSize: context.responsiveFontSize(14),
                                color: Colors.green,
                              ),

                            ]

                          ],
                        ).paddingAll(12),
                      );
                    },
                  ),
                ),
                16.pixelHeight,
                GetButtonWithIcon(
                  onTap: () {
                    context.read<AdsProvider>().showInterstitialAd(context);
                    provider.resetPermitTest(context);
                  },
                  text: retryTest,
                  color: primaryColor, icon: retryIcon,
                ),
              ],
            ).paddingAll(16),
          ),
        );
      },
    );
  }
}